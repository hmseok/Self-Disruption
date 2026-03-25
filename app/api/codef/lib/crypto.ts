import crypto from 'crypto'

export function encryptPassword(password: string): string {
  const publicKey = process.env.CODEF_PUBLIC_KEY!
  const pemKey = `-----BEGIN PUBLIC KEY-----\n${publicKey.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`

  const encrypted = crypto.publicEncrypt(
    {
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(password, 'utf8')
  )

  return encrypted.toString('base64')
}
