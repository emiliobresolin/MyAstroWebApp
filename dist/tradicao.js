'use strict';

const [Sol, Lua, Mercurio, Venus, Marte, Jupiter, Saturno] = astros.slice(0, 7).map(astro => astro[1]);
const exaltacoes = [Sol, Lua, null, Jupiter, null, Mercurio, Saturno, null, null, Marte, null, Venus];
const triplicidades = [[Sol, Jupiter], [Venus, Lua], [Saturno, Mercurio], [Venus, Marte]];
const faces = [Marte, Sol, Venus, Mercurio, Lua, Saturno, Jupiter];
const termos = [
  [[6,Jupiter],[14,Venus],[21,Mercurio],[26,Marte],[30,Saturno]],
  [[8,Venus],[14,Mercurio],[22,Jupiter],[27,Saturno],[30,Marte]],
  [[6,Mercurio],[12,Jupiter],[17,Venus],[24,Marte],[30,Saturno]],
  [[7,Marte],[13,Venus],[19,Mercurio],[26,Jupiter],[30,Saturno]],
  [[6,Jupiter],[11,Venus],[18,Saturno],[24,Mercurio],[30,Marte]],
  [[7,Mercurio],[17,Venus],[21,Jupiter],[28,Marte],[30,Saturno]],
  [[6,Saturno],[14,Mercurio],[21,Jupiter],[28,Venus],[30,Marte]],
  [[7,Marte],[11,Venus],[19,Mercurio],[24,Jupiter],[30,Saturno]],
  [[12,Jupiter],[17,Venus],[21,Mercurio],[26,Saturno],[30,Marte]],
  [[7,Mercurio],[14,Jupiter],[22,Venus],[26,Saturno],[30,Marte]],
  [[7,Mercurio],[13,Venus],[20,Jupiter],[25,Marte],[30,Saturno]],
  [[12,Venus],[16,Jupiter],[19,Mercurio],[28,Marte],[30,Saturno]]
];

function mapaDiurno(natal) {
  const observador = new Astronomy.Observer(natal.lat, natal.lon, 0);
  const equador = Astronomy.Equator(Astronomy.Body.Sun, natal.utc, observador, true, true);
  return Astronomy.Horizon(natal.utc, observador, equador.ra, equador.dec).altitude >= 0;
}

function lotesHermeticos(natal, diurno) {
  const [sol, lua, mercurio, venus, marte, jupiter, saturno] = natal.pontos.map(ponto => ponto.graus);
  const projetar = (fim, inicio) => normalizar(natal.asc.graus + (diurno ? fim - inicio : inicio - fim));
  const fortuna = projetar(lua, sol);
  const espirito = projetar(sol, lua);
  return [
    ['Fortuna', fortuna], ['Espírito', espirito], ['Eros', projetar(venus, espirito)],
    ['Necessidade', projetar(fortuna, mercurio)], ['Coragem', projetar(fortuna, marte)],
    ['Vitória', projetar(jupiter, espirito)], ['Nêmesis', projetar(fortuna, saturno)]
  ].map(([nome, graus]) => ({nome, graus}));
}

function dignidades(graus, diurno) {
  const longitude = normalizar(graus);
  const signo = Math.floor(longitude / 30);
  const grau = longitude % 30;
  return [
    ['Domicílio', regentes[signo], 5],
    ['Exaltação', exaltacoes[signo], 4],
    ['Triplicidade', triplicidades[signo % 4][diurno ? 0 : 1], 3],
    ['Termo', termos[signo].find(([fim]) => grau < fim)[1], 2],
    ['Face', faces[Math.floor(longitude / 10) % 7], 1]
  ].filter(([, planeta]) => planeta);
}

function pontuarDignidades(pontos, diurno) {
  const placar = new Map(astros.slice(0, 7).map(([, nome]) => [nome, 0]));
  for (const ponto of pontos) {
    for (const [, planeta, valor] of dignidades(ponto.graus, diurno)) {
      placar.set(planeta, placar.get(planeta) + valor);
    }
  }
  return [...placar].sort((a, b) => b[1] - a[1]);
}

function recepcoes(planetas, diurno) {
  const tipos = (hospede, anfitriao) => dignidades(hospede.graus, diurno)
    .filter(([, planeta]) => planeta === anfitriao.nome)
    .map(([tipo]) => tipo);
  return planetas.flatMap((a, i) => planetas.slice(i + 1).flatMap(b => {
    const recebeA = tipos(a, b);
    const recebeB = tipos(b, a);
    return recebeA.length || recebeB.length ? [{a, b, recebeA, recebeB}] : [];
  }));
}

const espelhoSolsticial = graus => normalizar(180 - graus);
const espelhoEquinocial = graus => normalizar(-graus);

// Coordenadas equatoriais J2000 selecionadas do catálogo de efemérides.
const catalogoEstelar = [
  ['Aldebaran', 4,35,55.237, 1,16,30,33.39],
  ['Algol', 3,8,10.131, 1,40,57,20.43],
  ['Antares', 16,29,24.439, -1,26,25,55.15],
  ['Regulus', 10,8,22.315, 1,11,58,1.89],
  ['Sirius', 6,45,8.871, -1,16,42,57.99],
  ['Spica', 13,25,11.587, -1,11,9,40.71],
  ['Arcturus', 14,15,39.677, 1,19,10,56.71],
  ['Vega', 18,36,56.332, 1,38,47,1.17],
  ['Fomalhaut', 22,57,39.055, -1,29,37,20.10]
];

function estrelasFixas(natal) {
  const tempo = Astronomy.MakeTime(natal.utc);
  const alvos = [...natal.pontos, natal.asc];
  return catalogoEstelar.map(([nome, h, m, s, sinal, d, dm, ds]) => {
    const ra = (h + m / 60 + s / 3600) * 15;
    const dec = sinal * (d + dm / 60 + ds / 3600);
    const vetor = Astronomy.VectorFromSphere(new Astronomy.Spherical(dec, ra, 1), tempo);
    const graus = Astronomy.Ecliptic(vetor).elon;
    const conjuncoes = alvos.map(alvo => ({ nome: alvo.nome, orbe: Math.abs(diferencaAngular(graus, alvo.graus)) }))
      .filter(item => item.orbe <= 1).sort((a, b) => a.orbe - b.orbe);
    return { nome, graus, conjuncoes };
  });
}

function analiseTradicional(natal) {
  const diurno = mapaDiurno(natal);
  const lotes = lotesHermeticos(natal, diurno);
  const faseNova = Astronomy.SearchMoonPhase(0, natal.utc, -32);
  const faseCheia = Astronomy.SearchMoonPhase(180, natal.utc, -32);
  const fases = [faseNova, faseCheia].filter(Boolean).sort((a, b) => b.ut - a.ut);
  const pontosAlmuten = [natal.pontos[0], natal.pontos[1], natal.asc, lotes[0]];
  if (fases.length) pontosAlmuten.push({nome:'Sizígia pré-natal', graus:longitudeDe('Moon', fases[0])});
  return {
    diurno, lotes, pontosAlmuten,
    placar: pontuarDignidades(pontosAlmuten, diurno),
    recepcoes: recepcoes(natal.pontos.slice(0, 7), diurno),
    estrelas: estrelasFixas(natal)
  };
}
