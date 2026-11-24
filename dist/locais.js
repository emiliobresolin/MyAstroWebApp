'use strict';

const cidadesLocais = [
  ['São Paulo', 'Brasil', -23.5505, -46.6333, 'America/Sao_Paulo'],
  ['Rio de Janeiro', 'Brasil', -22.9068, -43.1729, 'America/Sao_Paulo'],
  ['Brasília', 'Brasil', -15.7939, -47.8828, 'America/Sao_Paulo'],
  ['Belo Horizonte', 'Brasil', -19.9167, -43.9345, 'America/Sao_Paulo'],
  ['Porto Alegre', 'Brasil', -30.0346, -51.2177, 'America/Sao_Paulo'],
  ['Curitiba', 'Brasil', -25.4284, -49.2733, 'America/Sao_Paulo'],
  ['Recife', 'Brasil', -8.0476, -34.877, 'America/Recife'],
  ['Salvador', 'Brasil', -12.9777, -38.5016, 'America/Bahia'],
  ['Manaus', 'Brasil', -3.119, -60.0217, 'America/Manaus'],
  ['Lisboa', 'Portugal', 38.7223, -9.1393, 'Europe/Lisbon'],
  ['Londres', 'Reino Unido', 51.5074, -0.1278, 'Europe/London'],
  ['Nova York', 'Estados Unidos', 40.7128, -74.006, 'America/New_York'],
  ['Tóquio', 'Japão', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Katmandu', 'Nepal', 27.7172, 85.324, 'Asia/Kathmandu']
];

const caixaCidade = document.querySelector('#city');
const listaCidades = document.querySelector('#city-results');
const avisoBusca = document.querySelector('#search-status');
const nomeLocal = document.querySelector('#place-name');
const mapaLocal = L.map('place-map', {
  minZoom: 1, maxZoom: 8, scrollWheelZoom: false,
  maxBounds: [[-85, -180], [85, 180]], maxBoundsViscosity: 0.9
}).setView([-23.5505, -46.6333], 4);
mapaLocal.attributionControl.setPrefix(false);
mapaLocal.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
L.geoJSON(worldCountries, {
  interactive: false,
  style: { color: '#6b7795', weight: 1, fillColor: '#374561', fillOpacity: 0.95 }
}).addTo(mapaLocal);
const pontoLocal = L.circleMarker([-23.5505, -46.6333], {
  radius: 7, color: '#f6eaff', fillColor: '#c68cff', fillOpacity: 1, weight: 2, interactive: false
}).addTo(mapaLocal);
nomeLocal.textContent = 'São Paulo, Brasil';

function definirLocal(latitude, longitude, nome, zona, centralizar) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 89.99 || Math.abs(longitude) > 180) return;
  form.elements.latitude.value = latitude.toFixed(5);
  form.elements.longitude.value = longitude.toFixed(5);
  if (zona) form.dataset.timeZone = zona;
  else delete form.dataset.timeZone;
  nomeLocal.textContent = nome;
  pontoLocal.setLatLng([latitude, longitude]);
  if (centralizar) mapaLocal.setView([latitude, longitude], 6);
  if (form.checkValidity()) atualizar();
}

mapaLocal.on('click', ({ latlng }) => {
  definirLocal(latlng.lat, latlng.lng, 'Ponto selecionado no mapa', null, false);
});
for (const campo of ['latitude', 'longitude']) {
  form.elements[campo].addEventListener('input', () => {
    delete form.dataset.timeZone;
    nomeLocal.textContent = 'Coordenadas manuais';
  });
}
form.addEventListener('submit', () => {
  const latitude = Number(form.elements.latitude.value);
  const longitude = Number(form.elements.longitude.value);
  pontoLocal.setLatLng([latitude, longitude]);
});

const compararTexto = texto => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
let buscaAtual;

function listarCidades(cidades) {
  listaCidades.replaceChildren(...cidades.map(([nome, regiao, latitude, longitude, zona]) => {
    const item = document.createElement('li');
    const botao = elemento('button', [nome, regiao].filter(Boolean).join(', '));
    botao.type = 'button';
    botao.className = 'secondary';
    botao.addEventListener('click', () => {
      buscaAtual?.abort();
      caixaCidade.value = nome;
      listaCidades.hidden = true;
      avisoBusca.textContent = 'Local selecionado.';
      definirLocal(latitude, longitude, botao.textContent, zona, true);
    });
    item.append(botao);
    return item;
  }));
  listaCidades.hidden = !cidades.length;
}

async function buscarCidade() {
  buscaAtual?.abort();
  const termo = caixaCidade.value.trim();
  if (termo.length < 2) {
    listarCidades([]);
    avisoBusca.textContent = 'Digite pelo menos duas letras.';
    return;
  }
  const consulta = new AbortController();
  buscaAtual = consulta;
  const locais = cidadesLocais.filter(([nome, pais]) =>
    compararTexto(`${nome} ${pais}`).includes(compararTexto(termo)));
  listarCidades(locais);
  avisoBusca.textContent = 'Buscando cidades…';
  try {
    const parametros = new URLSearchParams({ name: termo, language: 'pt', count: '8' });
    const resposta = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${parametros}`, {
      signal: AbortSignal.any([consulta.signal, AbortSignal.timeout(8000)])
    });
    if (!resposta.ok) throw new Error('Busca indisponível');
    const { results = [] } = await resposta.json();
    if (consulta.signal.aborted) return;
    const encontrados = results.map(cidade => [
      cidade.name, [...new Set([cidade.admin1, cidade.country].filter(Boolean))].join(', '),
      cidade.latitude, cidade.longitude, cidade.timezone
    ]);
    const opcoes = encontrados.length ? encontrados : locais;
    listarCidades(opcoes);
    avisoBusca.textContent = opcoes.length ? 'Selecione a cidade na lista.' : 'Nenhuma cidade encontrada.';
  } catch {
    if (consulta.signal.aborted) return;
    avisoBusca.textContent = locais.length
      ? 'Busca online indisponível. Selecione um resultado offline.'
      : 'Busca online indisponível. Use o mapa ou informe as coordenadas.';
  }
}

caixaCidade.addEventListener('input', () => {
  buscaAtual?.abort();
  listaCidades.hidden = true;
  avisoBusca.textContent = 'Pressione Buscar para pesquisar.';
});
caixaCidade.addEventListener('keydown', evento => {
  if (evento.key === 'Enter') {
    evento.preventDefault();
    buscarCidade();
  }
});
document.querySelector('#search-city').addEventListener('click', buscarCidade);
document.querySelector('#example').addEventListener('click', () => {
  buscaAtual?.abort();
  caixaCidade.value = '';
  listaCidades.hidden = true;
  avisoBusca.textContent = 'A busca mundial usa internet. O mapa funciona offline.';
  nomeLocal.textContent = 'São Paulo, Brasil';
  pontoLocal.setLatLng([-23.5505, -46.6333]);
  mapaLocal.setView([-23.5505, -46.6333], 4);
});
