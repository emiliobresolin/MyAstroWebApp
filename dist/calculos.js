'use strict';

const signos = [
  ['Áries', '♈'], ['Touro', '♉'], ['Gêmeos', '♊'], ['Câncer', '♋'],
  ['Leão', '♌'], ['Virgem', '♍'], ['Libra', '♎'], ['Escorpião', '♏'],
  ['Sagitário', '♐'], ['Capricórnio', '♑'], ['Aquário', '♒'], ['Peixes', '♓']
];
const astros = [
  ['Sun', 'Sol', '☉'], ['Moon', 'Lua', '☽'], ['Mercury', 'Mercúrio', '☿'],
  ['Venus', 'Vênus', '♀'], ['Mars', 'Marte', '♂'], ['Jupiter', 'Júpiter', '♃'],
  ['Saturn', 'Saturno', '♄'], ['Uranus', 'Urano', '♅'],
  ['Neptune', 'Netuno', '♆'], ['Pluto', 'Plutão', '♇']
];
const normalizar = graus => ((graus % 360) + 360) % 360;

function instanteUtc(data, hora, fuso) {
  const partes = /^([+-])(\d{2}):(\d{2})$/.exec(fuso);
  if (!partes) throw new Error('Informe o fuso no formato −03:00, usando o sinal do teclado.');
  const [, sinal, hh, mm] = partes;
  const minutos = Number(hh) * 60 + Number(mm);
  if (Number(mm) >= 60 || minutos > 14 * 60) throw new Error('Informe um fuso válido, entre −14:00 e +14:00.');
  return new Date(horaCivil(data, hora) - (sinal === '-' ? -1 : 1) * minutos * 60_000);
}

function horaCivil(data, hora) {
  const texto = `${data}T${hora}:00.000Z`;
  const instante = new Date(texto);
  if (!Number.isFinite(+instante) || instante.toISOString() !== texto ||
      data < '1800-01-01' || data > '2100-12-31') {
    throw new Error('Informe uma data entre 1800 e 2100 e uma hora válida.');
  }
  return +instante;
}

function resolverFuso(data, hora, zona) {
  const civil = horaCivil(data, hora);
  let formato;
  try {
    formato = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' });
  } catch {
    throw new Error('Fuso indisponível para este local. Informe o fuso UTC manualmente.');
  }
  const fusoEm = instante => {
    const texto = formato.formatToParts(instante).find(parte => parte.type === 'timeZoneName').value;
    return texto === 'GMT' ? '+00:00' : texto.slice(3);
  };
  const opcoes = new Set([-36, -24, -12, 0, 12, 24, 36].map(horas => fusoEm(civil + horas * 3_600_000)));
  const instantes = [];
  for (const fuso of opcoes) {
    const [horas, minutos, segundos = 0] = fuso.slice(1).split(':').map(Number);
    const deslocamento = (horas * 3600 + minutos * 60 + segundos) * (fuso[0] === '-' ? -1 : 1);
    const instante = civil - deslocamento * 1000;
    if (fusoEm(instante) === fuso) instantes.push({ utc: new Date(instante), fuso });
  }
  if (instantes.length !== 1) {
    const descricao = instantes.length
      ? `Esse horário ocorreu duas vezes (${instantes.map(item => item.fuso).join(' ou ')}).`
      : 'Esse horário local não existiu devido a uma mudança de fuso.';
    throw new Error(`${descricao} Confira a hora ou informe o fuso UTC manualmente.`);
  }
  return instantes[0];
}

function ascendente(tempo, latitude, longitude) {
  const observador = new Astronomy.Observer(latitude, longitude, 0);
  const rotacao = Astronomy.CombineRotation(
    Astronomy.Rotation_ECT_EQD(tempo),
    Astronomy.Rotation_EQD_HOR(tempo, observador)
  );

  // A interseção dos planos da eclíptica e do horizonte é uma linha.
  // Projetamos seus dois sentidos e escolhemos o que aponta para leste.
  const eixo = (x, y) => Astronomy.RotateVector(rotacao, new Astronomy.Vector(x, y, 0, tempo));
  const zero = eixo(1, 0);
  const noventa = eixo(0, 1);
  if (Math.hypot(zero.z, noventa.z) < 1e-10) {
    throw new Error('O Ascendente é indeterminado para esse instante e local.');
  }
  const angulo = Math.atan2(-zero.z, noventa.z);
  const ponto = eixo(Math.cos(angulo), Math.sin(angulo));
  if (Math.abs(ponto.y) < 1e-10) {
    throw new Error('O Ascendente é indeterminado para esse instante e local.');
  }
  // O eixo horizontal y da biblioteca aponta para oeste.
  return normalizar(angulo * 180 / Math.PI + (ponto.y > 0 ? 180 : 0));
}

function calcularMapa(entrada) {
  const { date, time, offset, latitude, longitude, autoOffset, timeZone, houseSystem = 'whole' } = entrada;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (String(latitude).trim() === '' || String(longitude).trim() === '' ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 89.99 || Math.abs(lon) > 180) {
    throw new Error('Informe latitude entre −89,99 e 89,99 e longitude entre −180 e 180.');
  }
  const zona = autoOffset ? (timeZone || tzlookup(lat, lon)) : null;
  const { utc, fuso } = zona ? resolverFuso(date, time, zona) : { utc: instanteUtc(date, time, offset), fuso: offset };
  return { ...mapaNoInstante(utc, lat, lon, houseSystem), fuso, zona, dataCivil: date };
}

function longitudeDe(id, instante) {
  return normalizar(Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[id], instante, true)).elon);
}

function posicoesPlanetarias(utc) {
  const tempo = Astronomy.MakeTime(utc);
  const anterior = tempo.AddDays(-0.05);
  const posterior = tempo.AddDays(0.05);
  return astros.map(([id, nome, simbolo]) => {
    const graus = longitudeDe(id, tempo);
    const movimento = normalizar(longitudeDe(id, posterior) - longitudeDe(id, anterior) + 180) - 180;
    return { nome, simbolo, graus, retrogrado: movimento < 0 };
  });
}

function mapaNoInstante(utc, lat, lon, houseSystem) {
  const tempo = Astronomy.MakeTime(utc);
  const pontos = posicoesPlanetarias(utc);
  const asc = { nome: 'Ascendente', simbolo: 'ASC', graus: ascendente(tempo, lat, lon) };
  const primeira = houseSystem === 'equal' ? asc.graus : Math.floor(asc.graus / 30) * 30;
  const casas = houseSystem === 'placidus'
    ? casasPlacidus(tempo, lat, lon, asc.graus)
    : Array.from({ length: 12 }, (_, i) => normalizar(primeira + i * 30));
  const larguras = casas.map((grau, i) => normalizar(casas[(i + 1) % 12] - grau));
  for (const ponto of [...pontos, asc]) {
    ponto.casa = 1 + casas.findIndex((grau, i) => normalizar(ponto.graus - grau) < larguras[i]);
  }
  return { utc, pontos, asc, casas, aspectos: detectarAspectos([...pontos, asc]), lat, lon, houseSystem };
}

function casasPlacidus(tempo, latitude, longitude, asc) {
  const rad = Math.PI / 180;
  const rotacao = Astronomy.Rotation_ECT_EQD(tempo);
  const vetorEq = angulo => Astronomy.RotateVector(rotacao,
    new Astronomy.Vector(Math.cos(angulo), Math.sin(angulo), 0, tempo));
  const obliquidade = Math.abs(Math.asin(vetorEq(Math.PI / 2).z));
  if (Math.abs(latitude) * rad >= Math.PI / 2 - obliquidade) {
    throw new Error('Placidus é indeterminado nesta latitude. Escolha casas iguais ou signos inteiros.');
  }
  const lst = normalizar(Astronomy.SiderealTime(tempo) * 15 + longitude);
  const meridiano = lst * rad;
  const componente = vetor => vetor.y * Math.cos(meridiano) - vetor.x * Math.sin(meridiano);
  const a = componente(vetorEq(0));
  const b = componente(vetorEq(Math.PI / 2));
  const candidato = Math.atan2(-a, b);
  const vetor = vetorEq(candidato);
  const mesmoLado = vetor.x * Math.cos(meridiano) + vetor.y * Math.sin(meridiano) >= 0;
  const mc = normalizar(candidato / rad + (mesmoLado ? 0 : 180));
  const ic = normalizar(mc + 180);
  const tanLatitude = Math.tan(latitude * rad);

  function cuspide(inicio, fim, fracao, abaixo) {
    let baixo = inicio;
    let alto = inicio + normalizar(fim - inicio);
    for (let i = 0; i < 38; i += 1) {
      const meio = (baixo + alto) / 2;
      const eq = vetorEq(meio * rad);
      const ra = Math.atan2(eq.y, eq.x) / rad;
      const dec = Math.asin(eq.z);
      const h0 = Math.acos(-tanLatitude * Math.tan(dec)) / rad;
      const alvo = abaixo ? h0 + fracao * (180 - h0) : fracao * h0;
      if (diferencaAngular(lst - ra, -alvo) > 0) baixo = meio;
      else alto = meio;
    }
    return normalizar((alto + baixo) / 2);
  }

  const c11 = cuspide(mc, asc, 1 / 3, false);
  const c12 = cuspide(mc, asc, 2 / 3, false);
  const c2 = cuspide(asc, ic, 1 / 3, true);
  const c3 = cuspide(asc, ic, 2 / 3, true);
  const oposto = graus => normalizar(graus + 180);
  return [asc, c2, c3, ic, oposto(c11), oposto(c12),
    oposto(asc), oposto(c2), oposto(c3), mc, c11, c12];
}

const angulosPrincipais = [
  ['Conjunção', 0, 8, '#d5b5ff'],
  ['Sextil', 60, 4, '#73b4d0'],
  ['Quadratura', 90, 6, '#ee9a99'],
  ['Trígono', 120, 6, '#73b4d0'],
  ['Oposição', 180, 8, '#ee9a99']
];

function detectarAspectos(pontos, alvos = null) {
  const encontrados = [];
  for (const [i, a] of pontos.entries()) {
    for (const b of alvos ?? pontos.slice(i + 1)) {
      const distancia = Math.abs(diferencaAngular(a.graus, b.graus));
      for (const [nome, angulo, limite, cor] of angulosPrincipais) {
        const orbe = Math.abs(distancia - angulo);
        if (orbe <= limite) encontrados.push({ a, b, nome, orbe, cor });
      }
    }
  }
  return encontrados.sort((a, b) => a.orbe - b.orbe);
}

function diferencaAngular(a, b) {
  return normalizar(a - b + 180) - 180;
}

function grausMinutos(graus) {
  const minutos = Math.floor(graus * 60);
  return `${Math.floor(minutos / 60)}° ${String(minutos % 60).padStart(2, '0')}′`;
}

function posicao(graus) {
  const longitude = normalizar(graus);
  const [nome, simbolo] = signos[Math.floor(longitude / 30)];
  return { nome, simbolo, texto: grausMinutos(longitude % 30) };
}
