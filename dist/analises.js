'use strict';

const formularioTempo = document.querySelector('#timing');
const painelTempo = document.querySelector('#timing-results');
const erroTempo = document.querySelector('#timing-error');
const rodaSolar = document.querySelector('#solar-wheel');
const dataReferencia = formularioTempo.elements.reference;
const diaAnterior = document.querySelector('#previous-day');
const diaSeguinte = document.querySelector('#next-day');
const dataUtcLonga = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'UTC'
});
let mapaSolar;
let agendaAtual = [];
let estrelasAtuais = [];
const filtroEstrelas = document.querySelector('#stars-conjunctions');
const filtroAstro = document.querySelector('#forecast-planet');
const filtroAspecto = document.querySelector('#forecast-aspect');
const temasDasCasas = [
  'identidade e iniciativa', 'recursos e valores', 'comunicação e entorno',
  'lar e raízes', 'criatividade e prazer', 'rotina e trabalho cotidiano',
  'parcerias', 'recursos compartilhados', 'estudos e viagens',
  'carreira e vida pública', 'amizades e projetos coletivos', 'recolhimento e encerramentos'
];
const temasDosAstros = ['vitalidade e propósito', 'emoções e necessidades', 'conversas e decisões',
  'relações e valores', 'iniciativa e ação', 'crescimento e oportunidades', 'limites e compromissos',
  'mudança e autonomia', 'imaginação e sensibilidade', 'transformações e poder'];
const temasNatais = new Map(astros.map(([, nome], i) => [nome, temasDosAstros[i]]));
temasNatais.set('Ascendente', 'identidade e maneira de se apresentar');
const leiturasDosAspectos = {
  'Conjunção': 'ênfase',
  'Sextil': 'oportunidade de colaboração',
  'Quadratura': 'tensão que pode pedir ajustes',
  'Trígono': 'facilidade de integração',
  'Oposição': 'equilíbrio entre demandas'
};

function textoPosicao(graus) {
  const signo = posicao(graus);
  return `${signo.nome} ${signo.texto}`;
}

function preencherTabela(id, titulo, colunas, linhas, vazia = 'Nenhum resultado para este mapa.') {
  const destino = document.getElementById(id);
  if (!linhas.length) {
    destino.replaceChildren(elemento('p', titulo + ' · ' + vazia));
    return;
  }
  const tabela = document.createElement('table');
  const cabecalho = document.createElement('tr');
  cabecalho.append(...colunas.map(coluna => {
    const celula = elemento('th', coluna);
    celula.scope = 'col';
    return celula;
  }));
  const head = document.createElement('thead');
  head.append(cabecalho);
  const body = document.createElement('tbody');
  body.append(...linhas.map(celulas => {
    const linha = document.createElement('tr');
    linha.append(...celulas.map(celula => {
      const td = document.createElement('td');
      td.append(celula instanceof Node ? celula : String(celula));
      return td;
    }));
    return linha;
  }));
  tabela.append(elemento('caption', titulo), head, body);
  destino.replaceChildren(tabela);
}

function mostrarAstros(id, titulo, pontos, abrirPonto) {
  const casas = pontos.some(ponto => ponto.casa);
  preencherTabela(id, titulo, casas ? ['Ponto', 'Posição', 'Casa'] : ['Ponto', 'Posição'],
    pontos.map(ponto => {
      const rotulo = ponto.nome + (ponto.retrogrado ? ' ℞' : '');
      const celulas = [botaoDetalhe(rotulo, () => abrirPonto(ponto)), textoPosicao(ponto.graus)];
      if (casas) celulas.push(ponto.casa);
      return celulas;
    }));
}

function mostrarAspectosCruzados(id, titulo, aspectos, origem, base = mapa) {
  preencherTabela(id, titulo, ['Astro', base === mapa ? 'Ponto natal' : 'Outro ponto', 'Aspecto', 'Orbe'],
    aspectos.map(({a, b, nome, orbe}) => {
      const pontos = base === mapa
        ? [{ ...a, nome: `${a.nome} · ${origem}` }, { ...b, nome: `${b.nome} · Natal` }]
        : [a, b];
      return [botaoDetalhe(a.nome, () => explorarPontos(nome, pontos, `Orbe ${grausMinutos(orbe)}.`, base)),
        b.nome, nome, grausMinutos(orbe)];
    }),
    'Nenhum aspecto na orbe indicada.');
}

function compararPosicao(ponto, origem) {
  const natal = mapa.pontos.find(astro => astro.nome === ponto.nome);
  const diferenca = diferencaAngular(ponto.graus, natal.graus);
  explorarPontos(`${ponto.nome} · ${origem}`,
    [{ ...natal, nome: `${natal.nome} · Natal` }, { ...ponto, nome: `${ponto.nome} · ${origem}` }],
    `Deslocamento desde a posição natal: ${diferenca < 0 ? '−' : '+'}${grausMinutos(Math.abs(diferenca))}.`);
}

const formulasLotes = [
  ['Lua', 'Sol'], ['Sol', 'Lua'], ['Vênus', 'Espírito'], ['Fortuna', 'Mercúrio'],
  ['Fortuna', 'Marte'], ['Júpiter', 'Espírito'], ['Fortuna', 'Saturno']
];

function mostrarTradicao() {
  if (!mapa) return;
  const { diurno, lotes, pontosAlmuten, placar, recepcoes: pares, estrelas } = analiseTradicional(mapa);
  document.getElementById('sect').textContent = diurno ? 'Mapa diurno · Sol acima do horizonte' : 'Mapa noturno · Sol abaixo do horizonte';
  const vencedores = placar.filter(([, pontos]) => pontos === placar[0][1]).map(([nome]) => nome);
  document.getElementById('almuten-result').replaceChildren(botaoDetalhe(
    `Almuten dos cinco pontos · ${vencedores.join(' / ')} · ${placar[0][1]} pontos`, () =>
      explorarPontos('Almuten dos cinco pontos', pontosAlmuten,
        placar.map(([astro, pontos]) => `${astro} ${pontos}`).join(' · '))));
  preencherTabela('almuten-tables', 'Almuten por ponto', ['Ponto', 'Posição', 'Almuten', 'Pontos'],
    pontosAlmuten.map(ponto => {
      const notas = pontuarDignidades([ponto], diurno);
      const detalhe = dignidades(ponto.graus, diurno).map(([tipo, astro, valor]) => `${tipo}: ${astro} +${valor}`).join(' · ');
      return [botaoDetalhe(ponto.nome, () => explorarPontos(`Dignidades · ${ponto.nome}`, [ponto], detalhe)), textoPosicao(ponto.graus),
        notas.filter(([, total]) => total === notas[0][1]).map(([nome]) => nome).join(' / '), notas[0][1]];
    }));
  mostrarAstros('lots-table', 'Posições dos lotes', lotes, ponto => {
    const termos = formulasLotes[lotes.indexOf(ponto)];
    const [somar, subtrair] = diurno ? termos : [...termos].reverse();
    explorarPontos(`Lote de ${ponto.nome}`, [ponto], `Ascendente + ${somar} − ${subtrair}.`);
  });
  const pontos = [...mapa.pontos, mapa.asc];
  const espelho = (ponto, graus) => {
    const contatos = pontos.filter(alvo => alvo !== ponto && Math.abs(diferencaAngular(graus, alvo.graus)) <= 1);
    return textoPosicao(graus) + (contatos.length ? ` · ${contatos.map(alvo => alvo.nome).join(', ')} ≤ 1°` : '');
  };
  preencherTabela('mirror-table', 'Reflexões pelos eixos do zodíaco', ['Ponto', 'Antíscia', 'Contra-antíscia'],
    pontos.map(ponto => {
      const antiscia = espelhoSolsticial(ponto.graus);
      const contra = espelhoEquinocial(ponto.graus);
      return [botaoDetalhe(ponto.nome, () => explorarPontos(`Reflexões · ${ponto.nome}`,
        [ponto, { nome: 'Antíscia', graus: antiscia }, { nome: 'Contra-antíscia', graus: contra }])),
      espelho(ponto, antiscia), espelho(ponto, contra)];
    }));
  preencherTabela('receptions-table', 'Dignidades compartilhadas', ['Par', 'Recepção', 'Aspecto'],
    pares.map(({a,b,recebeA,recebeB}) => {
      const relacoes = [];
      if (recebeA.length) relacoes.push(`${b.nome} recebe ${a.nome} · ${recebeA.join(', ')}`);
      if (recebeB.length) relacoes.push(`${a.nome} recebe ${b.nome} · ${recebeB.join(', ')}`);
      const aspecto = mapa.aspectos.find(item => item.a === a && item.b === b);
      const texto = (relacoes.length > 1 ? 'Mútua · ' : '') + relacoes.join(' / ');
      return [botaoDetalhe(a.nome + ' · ' + b.nome, () => explorarPontos('Recepção', [a, b],
        texto + (aspecto ? ` · ${aspecto.nome} (${grausMinutos(aspecto.orbe)})` : ''))),
      texto, aspecto?.nome ?? '—'];
    }));
  estrelasAtuais = estrelas;
  mostrarEstrelas();
}

function mostrarEstrelas() {
  const estrelas = filtroEstrelas.checked ? estrelasAtuais.filter(estrela => estrela.conjuncoes.length > 0) : estrelasAtuais;
  preencherTabela('stars-table', 'Estrelas e conjunções', ['Estrela', 'Posição', 'Conjunção natal'],
    estrelas.map(estrela => {
      const contatos = estrela.conjuncoes.map(({nome, orbe}) => nome + ' ' + grausMinutos(orbe)).join(' / ');
      return [botaoDetalhe(estrela.nome, () => {
        const pontosNatais = [...mapa.pontos, mapa.asc];
        const conjuncoes = estrela.conjuncoes.slice(0, 3).map(item => pontosNatais.find(ponto => ponto.nome === item.nome));
        explorarPontos(estrela.nome, [estrela, ...conjuncoes], contatos || 'Nenhuma conjunção natal até 1°.');
      }), textoPosicao(estrela.graus), contatos || '—'];
    }), 'Nenhuma estrela dentro da orbe selecionada.');
}

function explorarEvento(item) {
  const natal = [...mapa.pontos, mapa.asc].find(ponto => ponto.nome === item.alvo);
  const id = astros.find(([, nome]) => nome === item.nomeAstro)[0];
  const transito = { nome: `${item.nomeAstro} · Trânsito`, graus: longitudeDe(id, item.utc) };
  explorarPontos(item.aspecto, [transito, { ...natal, nome: `${natal.nome} · Natal` }],
    dataUtcLonga.format(item.utc) + ' UTC', mapa, () => {
      const instante = item.utc.toISOString();
      if (instante.slice(0, 10) > dataReferencia.max) return;
      formularioTempo.elements.clock.value = instante.slice(11, 16);
      escolherData(instante.slice(0, 10));
      dataReferencia.focus();
    });
}

function mostrarEventos(id, titulo, eventos) {
  preencherTabela(id, titulo, ['Instante UTC', 'Trânsito', 'Ponto natal', 'Aspecto'],
    eventos.map(item => [botaoDetalhe(dataUtcLonga.format(item.utc), () => explorarEvento(item)), item.nomeAstro, item.alvo, item.aspecto]),
    'Nenhum aspecto exato no intervalo.');
}

function mostrarSintese(eventos) {
  const destino = document.getElementById('forecast-summary');
  const semLua = eventos.filter(item => item.nomeAstro !== Lua);
  const destaques = (semLua.length ? semLua : eventos).slice(0, 3);
  if (!destaques.length) return destino.replaceChildren();
  const lista = document.createElement('ul');
  for (const itemAgenda of destaques) {
    const { utc, nomeAstro, alvo, aspecto } = itemAgenda;
    const leitura = `${nomeAstro} · ${aspecto.toLowerCase()} a ${alvo} natal. ` +
      `Leitura simbólica: ${leiturasDosAspectos[aspecto]} entre ${temasNatais.get(nomeAstro)} e ${temasNatais.get(alvo)}.`;
    const item = document.createElement('li');
    item.append(botaoDetalhe(dataUtcLonga.format(utc) + ' UTC', () => explorarEvento(itemAgenda)), elemento('p', leitura));
    lista.append(item);
  }
  destino.replaceChildren(elemento('h3', 'Trânsitos em destaque'), lista);
}

function mostrarAgenda() {
  const filtrada = agendaAtual.filter(evento =>
    (!filtroAstro.value || evento.nomeAstro === filtroAstro.value) &&
    (!filtroAspecto.value || evento.aspecto === filtroAspecto.value));
  document.querySelector('#forecast-count').textContent = `${filtrada.length} de ${agendaAtual.length} eventos`;
  mostrarEventos('forecast-events', 'Calendário de aspectos', filtrada);
}

function mostrarCiclo(prof) {
  const nascimento = Number(mapa.dataCivil.slice(0, 4));
  const inicio = prof.idade - prof.idade % 12;
  const destino = document.querySelector('#profection-years');
  destino.replaceChildren(...Array.from({ length: Math.min(12, 2101 - nascimento - inicio) }, (_, i) => {
    const idade = inicio + i;
    const ano = nascimento + idade;
    const data = aniversario(mapa.dataCivil, ano).toISOString().slice(0, 10);
    const botao = botaoDetalhe(`${ano} · Casa ${i + 1}`, () => {
      escolherData(data);
      destino.querySelector(`[data-ano="${ano}"]`)?.focus();
    });
    botao.dataset.ano = ano;
    botao.setAttribute('aria-pressed', String(idade === prof.idade));
    return botao;
  }));
}

function calcularPrevisoes() {
  const valores = Object.fromEntries(new FormData(formularioTempo));
  const { reference, clock, days, returnLat, returnLon } = valores;
  if (!mapa) throw new Error('Calcule o mapa natal primeiro.');
  const referencia = new Date(horaCivil(reference, clock));
  if (reference < mapa.dataCivil) throw new Error('Escolha uma data a partir do nascimento.');
  if ((returnLat === '') !== (returnLon === '')) throw new Error('Informe as duas coordenadas da revolução solar.');
  const inicio = new Date(horaCivil(reference, '00:00'));
  const fimDia = +inicio + diaMs;
  const progressao = progressoSecundario(mapa, referencia);
  const retorno = returnLat === '' ? retornoSolar(mapa, referencia.getUTCFullYear()) :
    retornoSolar(mapa, referencia.getUTCFullYear(), Number(returnLat), Number(returnLon));
  const prof = profeccao(mapa, reference);
  const diario = posicoesPlanetarias(referencia);
  const aspectosDiarios = detectarAspectos(diario, [...mapa.pontos, mapa.asc]);
  const agenda = agendaTransitos(mapa, inicio, Number(days));

  document.getElementById('profection-text').textContent =
    `${prof.idade} anos completos · Casa ${prof.casa} · ${prof.signo} · Regente do ano: ${prof.regente}. Tema simbólico: ${temasDasCasas[prof.casa - 1]}.`;
  mostrarCiclo(prof);
  document.getElementById('progression-time').textContent =
    `Um dia por ano tropical. Instante simbólico: ${dataUtcLonga.format(progressao.utc)} UTC. Aspectos aos pontos natais até 1°.`;
  mostrarAstros('progression-table', 'Planetas progredidos', progressao.pontos, ponto => compararPosicao(ponto, 'Progressão'));
  mostrarAspectosCruzados('progression-aspects', 'Aspectos progredidos ao natal', progressao.aspectos, 'Progressão');
  document.getElementById('solar-time').textContent =
    `${dataUtcLonga.format(retorno.utc)} UTC · Local ${retorno.lat.toFixed(4)}, ${retorno.lon.toFixed(4)} · ${form.elements.houseSystem.selectedOptions[0].textContent}`;
  mapaSolar = retorno;
  mostrarAstros('solar-table', 'Posições da revolução solar', [...retorno.pontos, retorno.asc], ponto =>
    explorarPontos(`${ponto.nome} · Revolução solar`, [ponto], `Casa ${ponto.casa}`, retorno));
  mostrarAspectosCruzados('solar-aspects', 'Aspectos da revolução solar', retorno.aspectos, 'Revolução solar', retorno);
  document.getElementById('daily-time').textContent =
    `Posições em ${dataUtcLonga.format(referencia)} UTC e passagens exatas ao longo do dia UTC.`;
  mostrarAstros('daily-table', 'Planetas em trânsito', diario, ponto => compararPosicao(ponto, 'Trânsito'));
  mostrarAspectosCruzados('daily-aspects', 'Aspectos ao natal na hora de referência', aspectosDiarios, 'Trânsito');
  mostrarEventos('daily-events', 'Passagens exatas do dia', agenda.filter(item => +item.utc < fimDia));
  document.getElementById('forecast-time').textContent =
    `${days} dias a partir de ${reference.split('-').reverse().join('/')} UTC · aspectos exatos dos trânsitos ao natal.`;
  mostrarSintese(agenda);
  agendaAtual = agenda;
  mostrarAgenda();
  painelTempo.hidden = false;
  erroTempo.hidden = true;
  desenharRoda(mapaSolar, rodaSolar);
}

const agora = new Date();
dataReferencia.value = agora.toISOString().slice(0, 10);

function atualizarLimitesDaData() {
  dataReferencia.min = mapa?.dataCivil ?? '1800-01-01';
  diaAnterior.disabled = !dataReferencia.value || dataReferencia.value <= dataReferencia.min;
  diaSeguinte.disabled = !dataReferencia.value || dataReferencia.value >= dataReferencia.max;
}

function navegarUmDia(delta) {
  const atual = Date.parse(dataReferencia.value + 'T00:00:00Z');
  if (!Number.isFinite(atual)) return;
  const data = new Date(atual + delta * diaMs).toISOString().slice(0, 10);
  escolherData(data);
}

function escolherData(data) {
  if (data < dataReferencia.min || data > dataReferencia.max) return;
  dataReferencia.value = data;
  atualizarLimitesDaData();
  formularioTempo.requestSubmit();
}

for (const [, nome] of astros) filtroAstro.append(elemento('option', nome));
for (const [nome] of angulosPrincipais) filtroAspecto.append(elemento('option', nome));
filtroAstro.addEventListener('change', mostrarAgenda);
filtroAspecto.addEventListener('change', mostrarAgenda);
filtroEstrelas.addEventListener('change', mostrarEstrelas);
document.querySelector('#explore-solar').addEventListener('click', () => {
  if (mapaSolar) explorarPontos('Revolução solar', [], dataUtcLonga.format(mapaSolar.utc) + ' UTC', mapaSolar);
});
diaAnterior.addEventListener('click', () => navegarUmDia(-1));
diaSeguinte.addEventListener('click', () => navegarUmDia(1));
dataReferencia.addEventListener('input', atualizarLimitesDaData);
atualizarLimitesDaData();
new ResizeObserver(() => desenharRoda(mapaSolar, rodaSolar)).observe(rodaSolar);
formularioTempo.addEventListener('submit', evento => {
  evento.preventDefault();
  try {
    calcularPrevisoes();
  } catch (falha) {
    painelTempo.hidden = true;
    erroTempo.textContent = falha.message;
    erroTempo.hidden = false;
  }
});
document.addEventListener('natal-atualizado', () => {
  painelTempo.hidden = true;
  erroTempo.hidden = true;
  mapaSolar = null;
  if (dataReferencia.value < mapa.dataCivil) dataReferencia.value = mapa.dataCivil;
  atualizarLimitesDaData();
  mostrarTradicao();
});
mostrarTradicao();
