// 入参校验助手：统一 400 错误与中文提示
import { httpError } from './errors.js';

export function reqString(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw httpError(400, 'bad_request', `${label}必填`);
  return v.trim();
}

export function optString(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function reqPositiveCents(v, label = '金额') {
  if (!Number.isInteger(v) || v <= 0) throw httpError(400, 'bad_request', `${label}必填且必须为正整数（单位：分）`);
  return v;
}

export function reqEnum(v, allowed, label) {
  if (!allowed.includes(v)) throw httpError(400, 'bad_request', `${label}只能为：${allowed.join(' / ')}`);
  return v;
}

export function reqTs(v, label) {
  if (!Number.isFinite(v) || v <= 0) throw httpError(400, 'bad_request', `${label}必填（epoch 毫秒）`);
  return v;
}

export function optTs(v, label) {
  if (v === undefined || v === null) return null;
  return reqTs(v, label);
}

export function reqId(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'bad_request', `${label}非法`);
  return n;
}

export function optId(v) {
  if (v === undefined || v === null) return null;
  return reqId(v, 'id');
}
