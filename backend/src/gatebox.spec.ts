import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapStatus, signHeaders } from './gatebox.ts';

test('assinatura HMAC (exemplo da doc da Gatebox, conferido em Python)', () => {
  const h = signHeaders(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'POST',
    '/v1/customers/pix/withdraw',
    '{"amount":10.5,"key":"email@example.com"}',
    1735912345_000,
    'nonce-exemplo-123456',
  );
  assert.equal(h['X-Gatebox-Timestamp'], '1735912345');
  assert.equal(h['X-Gatebox-Signature'], 'v1=sha256=fdefdb7f639bab1a053c8cec0588f03d3e9e45d36877c5579039a7b0101fdcfb');
});

test('status da Gatebox', () => {
  assert.equal(mapStatus('COMPLETED'), 'paid');
  assert.equal(mapStatus('FAILED'), 'failed');
  assert.equal(mapStatus('REFUNDED'), 'failed');
  assert.equal(mapStatus('QUEUED'), 'processing');
  assert.equal(mapStatus(undefined), 'processing');
});
