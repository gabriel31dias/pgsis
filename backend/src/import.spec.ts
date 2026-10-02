import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidCpf, parseAmountCents, validateRows } from './import.ts';

test('cpf', () => {
  assert.ok(isValidCpf('529.982.247-25'));
  assert.ok(!isValidCpf('529.982.247-26'));
  assert.ok(!isValidCpf('111.111.111-11'));
});

test('valor', () => {
  assert.equal(parseAmountCents('1.250,00'), 125000);
  assert.equal(parseAmountCents('R$ 380,5'), 38050);
  assert.equal(parseAmountCents('1250.75'), 125075);
  assert.equal(parseAmountCents(''), null);
});

test('linhas', () => {
  const ok = { nome: 'Maria', cpf: '52998224725', chave_pix: 'x@y.com', valor: '10' };
  const { payments, errors } = validateRows([ok, { ...ok, cpf: '123' }, { ...ok, valor: '0' }]);
  assert.equal(payments.length, 1);
  assert.deepEqual(errors.map((e) => e.line), [3, 4]);
  assert.equal(validateRows([]).errors.length, 1);
});

test('dados bancários', () => {
  const base = { nome: 'Maria', cpf: '52998224725', valor: '10' };
  const { payments, errors } = validateRows([
    { ...base, banco: '1', agencia: '1234', conta: '12345-6' }, // banco "1" do Excel vira 001
    { ...base, banco: '001', agencia: '1234' }, // sem conta
    { ...base }, // sem destino
    { ...base, banco: '001', agencia: '12a4', conta: '123-4' },
  ]);
  assert.deepEqual(payments.map((p) => [p.bankCode, p.agency, p.account, p.pixKey]), [['001', '1234', '12345-6', null]]);
  assert.deepEqual(errors.map((e) => e.line), [3, 4, 5]);
});
