'use strict';

const form = document.querySelector('#birth');
const wheel = document.querySelector('#wheel');
const error = document.querySelector('#error');
const astroFocus = document.querySelector('#astro-focus');
const aspectToggle = document.querySelector('#show-aspects');
document.querySelector('#logout').hidden = location.protocol === 'file:';
const example = { date: '1990-05-17', time: '08:30', offset: '-03:00', latitude: '-23.5505', longitude: '-46.6333' };
let mapa;
let giro = 0;
let arraste;
const alvosRoda = [];

function desenharRoda(resultado = mapa, canvas = wheel, detalhe = null) {
  if (!resultado) return;
  const size = canvas.clientWidth;
  if (!size) return;
  const density = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * density);
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  const interativa = canvas === wheel;
  const foco = interativa ? astroFocus.value : '';
  if (interativa) alvosRoda.length = 0;
  const scale = canvas.width / 500;
  ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2);
  const { asc, pontos, casas, aspectos } = resultado;
  const xy = (graus, raio) => {
    const angulo = (180 - (graus - asc.graus) + (interativa ? giro : (detalhe?.giro ?? 0))) * Math.PI / 180;
    return [raio * Math.cos(angulo), raio * Math.sin(angulo)];
  };
  const linha = (inicio, fim, cor) => {
    ctx.strokeStyle = cor;
    ctx.beginPath();
    ctx.moveTo(...inicio);
    ctx.lineTo(...fim);
    ctx.stroke();
  };
  const circulo = (raio, cor) => {
    ctx.strokeStyle = cor;
    ctx.beginPath();
    ctx.arc(0, 0, raio, 0, 2 * Math.PI);
    ctx.stroke();
  };
  const texto = (valor, ponto, cor, fonte) => {
    ctx.fillStyle = cor;
    ctx.font = fonte;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valor, ...ponto);
  };
  const paleta = ['#eeb289', '#a6caa2', '#e4ca8b', '#99b6ef'];
  const fundo = ctx.createRadialGradient(0, 0, 20, 0, 0, 221);
  fundo.addColorStop(0, '#1d2a4c');
  fundo.addColorStop(1, '#111931');
  ctx.beginPath();
  ctx.arc(0, 0, 221, 0, Math.PI * 2);
  ctx.fillStyle = fundo;
  ctx.fill();
  circulo(224, '#4a4551');
  circulo(221, '#89785f');
  circulo(182, '#675f57');
  circulo(171, '#38455f');
  circulo(52, '#38455f');

  for (let grau = 0; grau < 360; grau += 2) {
    const divisao = grau % 30 === 0;
    const raio = grau % 10 === 0 ? 175 : 179;
    linha(xy(grau, divisao ? 182 : raio), xy(grau, divisao ? 221 : 182), divisao ? '#89785f' : '#586481');
  }
  signos.forEach(([, simbolo], i) => texto(simbolo, xy(i * 30 + 15, 202), paleta[i % 4], '26px "Segoe UI Symbol", sans-serif'));
  casas.forEach((grau, i) => {
    linha(xy(grau, 52), xy(grau, 171), '#343d56');
    const largura = normalizar(casas[(i + 1) % 12] - grau);
    texto(String(i + 1), xy(grau + largura / 2, 59), '#b7bdd4', '11px sans-serif');
  });
  if (!interativa || aspectToggle.checked) {
    for (const { a, b, cor } of aspectos) {
      const emFoco = foco && (a.nome === foco || b.nome === foco);
      ctx.globalAlpha = foco ? (emFoco ? 1 : 0.13) : 0.5;
      ctx.lineWidth = emFoco ? 2 : 1;
      linha(xy(a.graus, 51), xy(b.graus, 51), cor);
    }
  }
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  const ascLabel = xy(asc.graus, 234);
  linha(xy(asc.graus, 221), xy(asc.graus, 52), foco === asc.nome ? '#ffedc9' : '#d5b780');
  texto('ASC', ascLabel, '#f1d49e', '700 12px sans-serif');
  texto('✦', [0, 0], '#f1d49e', '25px serif');
  if (interativa) alvosRoda.push({ nome: asc.nome, centro: ascLabel });

  const ocupados = [];
  for (const ponto of pontos) {
    const raios = [153, 126, 99, 74];
    const candidatos = [0, -12, 12, -24, 24].flatMap(delta =>
      raios.map(raio => xy(ponto.graus + delta, raio)));
    const marcador = candidatos.find(([x, y]) =>
      ocupados.every(([a, b]) => Math.hypot(x - a, y - b) >= 26)) ?? candidatos[0];
    ocupados.push(marcador);
    if (interativa) alvosRoda.push({ nome: ponto.nome, centro: marcador });
    const ativo = ponto.nome === foco;
    linha(xy(ponto.graus, 171), marcador, '#6d7198');
    ctx.beginPath();
    ctx.arc(...marcador, ativo ? 15 : 13, 0, 2 * Math.PI);
    ctx.fillStyle = ativo ? '#f1d49e' : '#25324e';
    ctx.fill();
    texto(ponto.simbolo, marcador, ativo ? '#161d32' : '#f2edfb', '22px "Segoe UI Symbol", sans-serif');
  }
  const marcas = [];
  for (const [i, ponto] of (detalhe?.pontos ?? []).entries()) {
    const centro = [240, 217, 194, 171].map(raio => xy(ponto.graus, raio)).find(([x, y]) =>
      marcas.every(([a, b]) => Math.hypot(x - a, y - b) >= 18)) ?? xy(ponto.graus, 150);
    marcas.push(centro);
    linha(xy(ponto.graus, 158), centro, '#ffe0a1');
    ctx.beginPath();
    ctx.arc(...centro, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#f1d49e';
    ctx.fill();
    texto(String(i + 1), centro, '#142039', '700 11px sans-serif');
  }
}

function elemento(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function botaoDetalhe(rotulo, abrir) {
  const botao = elemento('button', rotulo);
  botao.type = 'button';
  botao.className = 'table-action';
  botao.addEventListener('click', abrir);
  return botao;
}

function selecionarAstro(nome) {
  astroFocus.value = nome;
  const ponto = mapa && [...mapa.pontos, mapa.asc].find(item => item.nome === nome);
  const destino = document.querySelector('#astro-details');
  destino.replaceChildren();
  if (ponto) {
    const signo = posicao(ponto.graus);
    const contatos = mapa.aspectos.filter(({a, b}) => a === ponto || b === ponto);
    destino.append(elemento('strong',
      `${ponto.nome} em ${signo.nome} · ${signo.texto} · Casa ${ponto.casa}${ponto.retrogrado ? ' · Retrógrado' : ''}`));
    const lista = document.createElement('ul');
    for (const { a, b, nome: aspecto, orbe } of contatos) {
      const outro = a === ponto ? b : a;
      lista.append(elemento('li', `${aspecto} com ${outro.nome} · ${grausMinutos(orbe)}`));
    }
    destino.append(contatos.length ? lista : elemento('p', 'Sem aspectos principais dentro da orbe.'));
  } else destino.append(elemento('p', 'Selecione um astro para inspecionar o mapa.'));
  for (const botao of document.querySelectorAll('#highlights button')) {
    botao.setAttribute('aria-pressed', String(botao.dataset.astro === nome));
  }
  desenharRoda();
}

function renderizar(resultado) {
  const { utc, fuso, zona, pontos, asc, casas, aspectos } = resultado;
  const horario = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
  }).format(utc);
  document.querySelector('#chart-time').textContent = horario + ' UTC';
  document.querySelector('#offset-help').textContent = zona ? `UTC${fuso} · ${zona}` : `Fuso manual · UTC${fuso}`;
  document.querySelector('#highlights').replaceChildren(...[pontos[0], pontos[1], asc].map(ponto => {
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.astro = ponto.nome;
    card.addEventListener('click', () => selecionarAstro(astroFocus.value === ponto.nome ? '' : ponto.nome));
    const signo = posicao(ponto.graus);
    card.append(elemento('span', ponto.nome), elemento('strong', signo.nome));
    return card;
  }));
  const anterior = astroFocus.value;
  astroFocus.replaceChildren(elemento('option', 'Todos os astros'), ...[...pontos, asc].map(ponto => elemento('option', ponto.nome)));
  astroFocus.options[0].value = '';
  document.querySelector('#positions').replaceChildren(...[...pontos, asc].map(ponto => {
    const linha = document.createElement('tr');
    const signo = posicao(ponto.graus);
    const titulo = document.createElement('th');
    titulo.append(botaoDetalhe(ponto.nome, () => selecionarAstro(ponto.nome)));
    if (ponto.retrogrado) {
      const marca = elemento('abbr', ' ℞');
      marca.title = 'Retrógrado';
      marca.setAttribute('aria-label', 'retrógrado');
      titulo.append(marca);
    }
    titulo.scope = 'row';
    linha.append(titulo, elemento('td', signo.nome), elemento('td', ponto.casa), elemento('td', signo.texto));
    return linha;
  }));
  document.querySelector('#houses').replaceChildren(...casas.map((graus, i) => {
    const linha = document.createElement('tr');
    const signo = posicao(graus);
    const nome = `Cúspide da casa ${i + 1}`;
    const celula = document.createElement('td');
    celula.append(botaoDetalhe(i + 1, () => explorarPontos(nome, [{ nome, graus }])));
    linha.append(celula, elemento('td', signo.nome), elemento('td', signo.texto));
    return linha;
  }));
  document.querySelector('#aspects').replaceChildren(...aspectos.map(({ a, b, nome, orbe }) => {
    const linha = document.createElement('tr');
    const celula = document.createElement('td');
    celula.append(botaoDetalhe(`${a.nome} · ${b.nome}`, () =>
      explorarPontos(nome, [a, b], `Orbe ${grausMinutos(orbe)}.`)));
    linha.append(celula, elemento('td', nome), elemento('td', grausMinutos(orbe)));
    return linha;
  }));
  document.querySelector('#aspect-table').hidden = !aspectos.length;
  document.querySelector('#no-aspects').hidden = !!aspectos.length;
  selecionarAstro(anterior);
}

function girarRoda(graus) {
  giro = normalizar(graus);
  desenharRoda();
}

function coordenadaRoda(evento) {
  const caixa = wheel.getBoundingClientRect();
  return [(evento.clientX - caixa.left) * 500 / caixa.width - 250,
    (evento.clientY - caixa.top) * 500 / caixa.height - 250];
}

wheel.addEventListener('pointerdown', evento => {
  if (arraste || evento.button !== 0) return;
  const [x, y] = coordenadaRoda(evento);
  arraste = { id: evento.pointerId, x, y, angulo: Math.atan2(y, x), giro, moveu: false };
  wheel.setPointerCapture(evento.pointerId);
});
wheel.addEventListener('pointermove', evento => {
  if (arraste?.id !== evento.pointerId) return;
  const [x, y] = coordenadaRoda(evento);
  if (Math.hypot(x - arraste.x, y - arraste.y) > 6) arraste.moveu = true;
  if (arraste.moveu && Math.hypot(arraste.x, arraste.y) >= 20 && Math.hypot(x, y) >= 20) {
    wheel.classList.add('dragging');
    girarRoda(arraste.giro + (Math.atan2(y, x) - arraste.angulo) * 180 / Math.PI);
  }
});
function terminarArraste(evento) {
  if (arraste?.id !== evento.pointerId) return;
  if (evento.type === 'pointerup' && !arraste.moveu) {
    const [x, y] = coordenadaRoda(evento);
    const alvo = alvosRoda
      .map(item => ({ nome: item.nome, distancia: Math.hypot(x - item.centro[0], y - item.centro[1]) }))
      .sort((a, b) => a.distancia - b.distancia)[0];
    if (alvo?.distancia <= 19) selecionarAstro(astroFocus.value === alvo.nome ? '' : alvo.nome);
  }
  arraste = null;
  wheel.classList.remove('dragging');
}
for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) wheel.addEventListener(tipo, terminarArraste);
astroFocus.addEventListener('change', () => selecionarAstro(astroFocus.value));
aspectToggle.addEventListener('change', () => desenharRoda());
document.querySelector('#rotate-left').addEventListener('click', () => girarRoda(giro - 15));
document.querySelector('#rotate-right').addEventListener('click', () => girarRoda(giro + 15));
document.querySelector('#rotate-reset').addEventListener('click', () => girarRoda(0));

function atualizar() {
  try {
    const entrada = Object.fromEntries(new FormData(form));
    entrada.timeZone = form.dataset.timeZone;
    mapa = calcularMapa(entrada);
    renderizar(mapa);
    error.hidden = true;
    document.dispatchEvent(new Event('natal-atualizado'));
  } catch (falha) {
    error.textContent = falha.message;
    error.hidden = false;
  }
}

function preencherExemplo() {
  for (const [campo, valor] of Object.entries(example)) form.elements.namedItem(campo).value = valor;
  form.elements.autoOffset.checked = true;
  form.elements.houseSystem.value = 'whole';
  delete form.dataset.timeZone;
  alternarFuso();
  atualizar();
}

function alternarFuso() {
  const automatico = form.elements.autoOffset.checked;
  form.elements.offset.disabled = automatico;
  document.querySelector('#manual-offset').hidden = automatico;
  document.querySelector('#offset-help').textContent = automatico
    ? 'O fuso é calculado para a data e o local informados.'
    : 'Informe o fuso vigente na data, incluindo horário de verão quando aplicável.';
}

form.addEventListener('submit', evento => {
  evento.preventDefault();
  atualizar();
});
form.elements.autoOffset.addEventListener('change', alternarFuso);
document.querySelector('#example').addEventListener('click', preencherExemplo);
new ResizeObserver(() => desenharRoda()).observe(wheel);
preencherExemplo();
