'use strict';

const diaMs = 86_400_000;
const anoTropical = 365.2422;
const regentes = ['Marte', 'Vênus', 'Mercúrio', 'Lua', 'Sol', 'Mercúrio', 'Vênus', 'Marte', 'Júpiter', 'Saturno', 'Saturno', 'Júpiter'];

function aniversario(data, ano) {
  const [, mes, dia] = data.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes - 1, Math.min(dia, ultimo)));
}

function profeccao(natal, data) {
  const ano = Number(data.slice(0, 4));
  const aniversarioDoAno = aniversario(natal.dataCivil, ano).toISOString().slice(0, 10);
  const idade = ano - Number(natal.dataCivil.slice(0, 4)) - (data < aniversarioDoAno ? 1 : 0);
  const casa = idade % 12 + 1;
  const signo = (Math.floor(natal.asc.graus / 30) + casa - 1) % 12;
  return { idade, casa, signo: signos[signo][0], regente: regentes[signo] };
}

function progressoSecundario(natal, referencia) {
  const diasSimbolicos = Math.max(0, referencia - natal.utc) / diaMs / anoTropical;
  const utc = new Date(+natal.utc + diasSimbolicos * diaMs);
  const pontos = posicoesPlanetarias(utc);
  const aspectos = detectarAspectos(pontos, [...natal.pontos, natal.asc]).filter(item => item.orbe <= 1);
  return { utc, pontos, aspectos };
}

function bissecao(funcao, inicio, fim, valorInicial) {
  let baixo = inicio;
  let alto = fim;
  let sinal = valorInicial;
  while (alto - baixo > 25) {
    const meio = Math.floor((baixo + alto) / 2);
    const valor = funcao(meio);
    if (valor === 0) return meio;
    if (Math.sign(valor) === Math.sign(sinal)) {
      baixo = meio;
      sinal = valor;
    } else alto = meio;
  }
  return Math.round((baixo + alto) / 2);
}

function retornoSolar(natal, ano, lat = natal.lat, lon = natal.lon) {
  const centro = +aniversario(natal.dataCivil, ano);
  const erro = millis => diferencaAngular(longitudeDe('Sun', new Date(millis)), natal.pontos[0].graus);
  const inicio = centro - 7 * diaMs;
  const fim = centro + 7 * diaMs;
  const esquerda = erro(inicio);
  if (!(esquerda < 0 && erro(fim) > 0)) throw new Error('Não foi possível localizar a revolução solar nesse ano.');
  const instante = new Date(bissecao(erro, inicio, fim, esquerda));
  return mapaNoInstante(instante, lat, lon, natal.houseSystem);
}

function amostrarTransito(id, cortes) {
  const amostras = cortes.map(tempo => ({ tempo, graus: longitudeDe(id, new Date(tempo)) }));
  const estacoes = [];
  for (let i = 1; i < amostras.length - 1; i += 1) {
    const anterior = amostras[i - 1];
    const meio = amostras[i];
    const posterior = amostras[i + 1];
    const entrada = diferencaAngular(meio.graus, anterior.graus);
    const saida = diferencaAngular(posterior.graus, meio.graus);
    if (entrada * saida >= 0) continue;
    let baixo = anterior.tempo;
    let alto = posterior.tempo;
    while (alto - baixo > 1000) {
      const primeiro = Math.round((2 * baixo + alto) / 3);
      const segundo = Math.round((baixo + 2 * alto) / 3);
      const a = longitudeDe(id, new Date(primeiro));
      const b = longitudeDe(id, new Date(segundo));
      if (entrada * diferencaAngular(b, a) > 0) baixo = primeiro;
      else alto = segundo;
    }
    const tempo = Math.round((baixo + alto) / 2);
    estacoes.push({ tempo, graus: longitudeDe(id, new Date(tempo)) });
  }
  return [...amostras, ...estacoes].sort((a, b) => a.tempo - b.tempo);
}

function agendaTransitos(natal, inicio, dias) {
  const saltos = 8 * dias;
  const cortes = Array.from({ length: saltos + 1 }, (_, i) => +inicio + i * diaMs / 8);
  const alvos = [...natal.pontos, natal.asc];
  const eventos = [];
  for (const [id, nomeAstro] of astros) {
    const amostras = amostrarTransito(id, cortes);
    for (const alvo of alvos) {
      for (const [aspecto, angulo] of angulosPrincipais) {
        const direcoes = angulo === 0 || angulo === 180 ? [angulo] : [angulo, -angulo];
        for (const direcao of direcoes) {
          const grau = normalizar(alvo.graus + direcao);
          let anterior = diferencaAngular(amostras[0].graus, grau);
          for (let i = 1; i < amostras.length; i += 1) {
            const atual = diferencaAngular(amostras[i].graus, grau);
            if (anterior === 0 || (anterior * atual < 0 && Math.abs(atual - anterior) < 180)) {
              const baixo = amostras[i - 1].tempo;
              const alto = amostras[i].tempo;
              const tempo = anterior === 0 ? baixo :
                bissecao(t => diferencaAngular(longitudeDe(id, new Date(t)), grau), baixo, alto, anterior);
              eventos.push({ utc: new Date(tempo), nomeAstro, alvo: alvo.nome, aspecto });
            }
            anterior = atual;
          }
        }
      }
    }
  }
  return eventos.sort((a, b) => a.utc - b.utc);
}
