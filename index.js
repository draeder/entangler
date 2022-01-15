const crypto = require('crypto')
var EventEmitter = require('events').EventEmitter
const base32 = require('hi-base32')
const qrcode = require('qrcode')
const { authenticator } = require('@otplib/preset-default')
const Gun = require('gun')
const { SEA } = require('gun')
const Bugoff = require('bugoff')

Gun.chain.entanglement = async function(sea, opts) {
  EventEmitter.call(this)
  let anon = true
  let instanceSEA

  this.entanglement.request = async (passcode) => {
    this.entanglement.passcode = base64(passcode)
  }

  if(typeof sea === 'string'){
    anon = true
    let pubkey = this.get(sea).once((data, key)=>{}).then(data => {
      try {
        return Object.keys(data)[1]
      }
      catch (err){
        return new Promise((resolve, reject) => {this.user(sea).once((data, key) => resolve(key))})
      }
    })

    pubkey = await pubkey
    pubkey = pubkey.split('~')[1]    

    this.entanglement.address = sha(pubkey)

    instanceSEA = await SEA.pair()

  } else {
    anon = false
  }

  if(anon === false) {
    this.entanglement = {
      address: opts && opts.address || sha(sea.pub),
      issuer: opts && opts.issuer || 'Entanglement Authenticator',
      user: opts && opts.user ? base32.encode(sha(opts.user)) : authenticator.generateSecret(),
      secret: opts && opts.secret ? base32.encode(sha(opts.secret)) : authenticator.generateSecret(),
      pin: opts && opts.pin || '',
      timeout: opts && opts.timeout || 1000 * 60 * 5,
      maxAttempts: opts && opts.maxAttempts || 10,
      period: opts && opts.period || 30,
      digits: opts && opts.digits || 6,
      algorithm: opts && opts.algorithm || 'SHA1',
      QR: {}
    }
  
    this.entanglement.uri = `otpauth://totp/${encodeURI(this.entanglement.issuer)}:${this.entanglement.user}?secret=${this.entanglement.secret}&period=${this.entanglement.period||30}&digits=${this.entanglement.digits||6}&algorithm=${this.entanglement.algorithm||'SHA256'}&issuer=${encodeURI(this.entanglement.issuer)}`
        
    this.entanglement.QR.terminal = async () => {
      try {
        return await qrcode.toString(this.entanglement.uri,{type:'terminal', small: true})
      }
      catch (err){
        throw new Error(err)
      }
    }

    this.entanglement.QR.image = async () => {
      try {
        return await qrcode.toDataURL(this.entanglement.uri)
      } catch (err) {
        throw new Error(err)
      }
    }

    instanceSEA = sea
  }

  let bugoff = new Bugoff(this.entanglement.address)
  bugoff.SEA(instanceSEA)
  bugoff.register('accepted', async (address, sea, cb) =>{
    this.events.emit('authorized', sea)
  })
  bugoff.register('rejected', async (address, other, cb) =>{
    this.events.emit('error', 'Incorrect passcode')
    if(this.entanglement.passcode) bugoff.rpc(address, 'challenge', this.entanglement.passcode)
  })
  
  this.entanglement.attempts = {}
  bugoff.register('challenge', async (address, verify, cb) =>{
    let t = new Date().getTime() - this.entanglement.attempts[address].first
    if(anon === false && !this.entanglement.timeout || anon === false && t < this.entanglement.timeout) {
      let check = base64(verify)
      let token = await this.entanglement.token()
      if(check.lastIndexOf(token.length + this.entanglement.pin.length === check.length && await this.entanglement.token()) >= 0 && check.includes(this.entanglement.pin)){
        bugoff.rpc(address, 'accepted', sea)
        this.entanglement.passcode = undefined
      } else {
        bugoff.rpc(address, 'rejected', 'Not authorized!')
        this.entanglement.attempts[address].count++
        this.events.emit('rejected')
        this.entanglement.passcode = undefined
        if(this.entanglement.maxAttempt && this.entanglement.maxAttempts === this.entanglement.attempts[address].count) {
          bugoff.destroy()
        }
      }
    } else return
  })

  bugoff.on('seen', address => {
    if(!this.entanglement.attempts[address]) this.entanglement.attempts[address] = {count: 0, first: new Date().getTime()}
    if(this.entanglement.passcode) bugoff.rpc(address, 'challenge', this.entanglement.passcode)
  })

  this.entanglement.token = async () => authenticator.generate(this.entanglement.secret)

  let secret = this.entanglement.secret
  this.entanglement.tokens = async function(cb) {
    const interval = setInterval(() => {
      let sec = new Date().getSeconds()
      if (sec === 0 || sec === 30) {
        cb(authenticator.generate(secret))
      }
    }, 1000)
  }

  function sha(input){
    return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
  }

  function base64(string){
    let regx = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;  
    if(regx.test(string) === false){
      return new Buffer.from(string).toString('base64')
    } else {
      let data = new Buffer.from(string, 'base64')
      return new Buffer.from(data).toString()
    }
  }

  return this
}

Gun.prototype.events = new EventEmitter()