import { signatureService } from '../src/services/signature.service';
const testBundle = { resourceType: "Bundle", type: "message", entry: [] };
const res = signatureService.signBundle(testBundle, 'Practitioner/123');
const parts = res.jwsCompact.split('.');
const sigB64 = parts[2];
const sigBuf = Buffer.from(sigB64, 'base64url');
console.log("JWS Alg:", JSON.parse(Buffer.from(parts[0], 'base64url').toString()).alg);
console.log("Sig Length:", sigBuf.length);
console.log("Sig Hex:", sigBuf.toString('hex'));
