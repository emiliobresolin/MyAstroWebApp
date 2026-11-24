const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const calc = vm.createContext({ Date });
for (const file of [
  'vendor/astronomy.browser.min.js', 'vendor/tz-lookup.js', 'calculos.js', 'tempos.js', 'tradicao.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8'), calc, { filename: file });
}

const entrada = {
  date: '1990-05-17', time: '08:30', autoOffset: true,
  latitude: -23.5505, longitude: -46.6333, houseSystem: 'placidus'
};
const natal = calc.calcularMapa(entrada);
const perto = (valor, esperado, tolerancia = 0.0002) => assert.ok(Math.abs(valor - esperado) < tolerancia);
const { normalizar, espelhoSolsticial, espelhoEquinocial } =
  vm.runInContext('({normalizar, espelhoSolsticial, espelhoEquinocial})', calc);

test('fuso histórico, horas repetidas e horas inexistentes', () => {
  assert.equal(natal.utc.toISOString(), '1990-05-17T11:30:00.000Z');
  assert.equal(calc.resolverFuso('2018-01-17', '08:30', 'America/Sao_Paulo').fuso, '-02:00');
  assert.equal(calc.resolverFuso('1985-05-15', '12:00', 'Asia/Kathmandu').fuso, '+05:30');
  assert.equal(calc.resolverFuso('2024-04-15', '12:00', 'Asia/Kathmandu').fuso, '+05:45');
  assert.throws(() => calc.resolverFuso('2024-03-10', '02:30', 'America/New_York'), /não existiu/);
  assert.throws(() => calc.resolverFuso('2024-11-03', '01:30', 'America/New_York'), /duas vezes/);
  assert.throws(() => calc.calcularMapa({ ...entrada, date: '2024-02-30' }), /data/);
});

test('Placidus fecha os eixos e trata latitudes polares', () => {
  perto(natal.asc.graus, 80.852629);
  assert.equal(natal.asc.casa, 1);
  for (let i = 0; i < 6; i += 1) {
    perto(normalizar(natal.casas[i + 6] - natal.casas[i]), 180);
  }
  for (const ponto of natal.pontos) assert.ok(ponto.casa >= 1 && ponto.casa <= 12);
  assert.throws(() => calc.calcularMapa({ ...entrada, latitude: 70 }), /Placidus/);
  assert.equal(calc.calcularMapa({ ...entrada, latitude: 70, houseSystem: 'equal' }).casas.length, 12);
});

test('progressão secundária desloca um dia por ano tropical', () => {
  const ano = 365.2422 * 86400000;
  const progredido = calc.progressoSecundario(natal, new Date(+natal.utc + ano));
  perto(+progredido.utc - +natal.utc, 86400000, 2);
  assert.equal(progredido.pontos.length, 10);
});

test('revolução solar converge à longitude natal e permite outro local', () => {
  const retorno = calc.retornoSolar(natal, 2026);
  const lisboa = calc.retornoSolar(natal, 2026, 38.7223, -9.1393);
  perto(calc.diferencaAngular(retorno.pontos[0].graus, natal.pontos[0].graus), 0, 0.00001);
  assert.equal(+lisboa.utc, +retorno.utc);
  assert.notEqual(lisboa.asc.graus, retorno.asc.graus);
  const equinocio = calc.calcularMapa({ ...entrada, date: '2024-03-20', time: '00:06' });
  const retornoEquinocio = calc.retornoSolar(equinocio, 2025);
  perto(calc.diferencaAngular(retornoEquinocio.pontos[0].graus, equinocio.pontos[0].graus), 0, 0.00001);
});

test('profecção muda no aniversário e reinicia no ciclo de 12 anos', () => {
  assert.equal(calc.profeccao(natal, '2002-05-16').casa, 12);
  assert.equal(calc.profeccao(natal, '2002-05-17').casa, 1);
  assert.equal(calc.profeccao(natal, '2002-05-17').regente, 'Mercúrio');
  assert.equal(calc.profeccao({ ...natal, dataCivil: '2000-02-29' }, '2001-02-28').idade, 1);
});

test('trânsitos exatos mantêm a ordem, o intervalo e o ângulo', () => {
  const inicio = new Date('2026-05-15T00:00:00Z');
  const agenda = calc.agendaTransitos(natal, inicio, 7);
  const nomes = vm.runInContext('Object.fromEntries(astros.map(([id, nome]) => [nome, id]))', calc);
  const angulos = vm.runInContext('Object.fromEntries(angulosPrincipais.map(([nome, graus]) => [nome, graus]))', calc);
  const pontos = [...natal.pontos, natal.asc];
  assert.ok(agenda.length > 10);
  for (const [i, evento] of agenda.entries()) {
    assert.ok(evento.utc >= inicio && evento.utc < +inicio + 7 * 86400000);
    if (i) assert.ok(evento.utc >= agenda[i - 1].utc);
    const longitude = calc.longitudeDe(nomes[evento.nomeAstro], evento.utc);
    const alvo = pontos.find(ponto => ponto.nome === evento.alvo);
    perto(Math.abs(calc.diferencaAngular(longitude, alvo.graus)), angulos[evento.aspecto], 0.00002);
  }
});

test('lotes invertem por seita, reflexões são involutivas e Regulus muda de signo', () => {
  const diurnos = calc.lotesHermeticos(natal, true);
  const noturnos = calc.lotesHermeticos(natal, false);
  assert.equal(diurnos.length, 7);
  perto(diurnos[0].graus, noturnos[1].graus);
  perto(diurnos[1].graus, noturnos[0].graus);
  for (const angulo of [0, 15, 95, 180, 359]) {
    perto(espelhoSolsticial(espelhoSolsticial(angulo)), angulo);
    perto(espelhoEquinocial(espelhoEquinocial(angulo)), angulo);
  }
  const regulus = mapa => calc.estrelasFixas(mapa).find(estrela => estrela.nome === 'Regulus');
  assert.equal(calc.posicao(regulus(natal).graus).nome, 'Leão');
  const moderno = calc.calcularMapa({ ...entrada, date: '2026-05-17' });
  assert.equal(calc.posicao(regulus(moderno).graus).nome, 'Virgem');
});

test('almuten, recepção mútua e conjunção no limite de Áries', () => {
  const analise = calc.analiseTradicional(natal);
  assert.equal(analise.pontosAlmuten.length, 5);
  assert.equal(analise.placar.length, 7);
  assert.ok(calc.dignidades(5, true).some(([tipo, planeta, pontos]) =>
    tipo === 'Domicílio' && planeta === 'Marte' && pontos === 5));
  const [recepcao] = calc.recepcoes([{ nome: 'Vênus', graus: 5 }, { nome: 'Marte', graus: 35 }], true);
  assert.ok(recepcao.recebeA.includes('Domicílio') && recepcao.recebeB.includes('Domicílio'));
  const [conjuncao] = calc.detectarAspectos([{ graus: 359 }, { graus: 2 }]);
  assert.equal(conjuncao.nome, 'Conjunção');
  assert.equal(conjuncao.orbe, 3);
});
