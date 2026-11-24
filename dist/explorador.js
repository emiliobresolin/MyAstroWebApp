'use strict';

const dialogoPonto = document.querySelector('#point-explorer');
const rodaDetalhe = document.querySelector('#explorer-wheel');
const aplicarEvento = document.querySelector('#explorer-use-event');
let exploracao;

function desenharDetalhe() {
  if (exploracao && dialogoPonto.open) desenharRoda(exploracao.base, rodaDetalhe, exploracao);
}

function explorarPontos(titulo, pontos, nota = '', base = mapa, aoAplicar = null) {
  exploracao = { base, pontos, giro: 0, aoAplicar };
  aplicarEvento.hidden = !aoAplicar;
  document.querySelector('#explorer-title').textContent = titulo;
  const texto = document.querySelector('#explorer-note');
  texto.textContent = nota;
  texto.hidden = !nota;
  document.querySelector('#explorer-points').replaceChildren(...pontos.map(ponto => {
    const signo = posicao(ponto.graus);
    return elemento('li', `${ponto.nome} · ${signo.nome} ${signo.texto}`);
  }));
  if (!dialogoPonto.open) dialogoPonto.showModal();
  desenharDetalhe();
}

function girarDetalhe(delta) {
  exploracao.giro = delta === null ? 0 : normalizar(exploracao.giro + delta);
  desenharDetalhe();
}

document.querySelector('#explorer-close').addEventListener('click', () => dialogoPonto.close());
document.querySelector('#explorer-left').addEventListener('click', () => girarDetalhe(-15));
document.querySelector('#explorer-right').addEventListener('click', () => girarDetalhe(15));
document.querySelector('#explorer-reset').addEventListener('click', () => girarDetalhe(null));
aplicarEvento.addEventListener('click', () => {
  dialogoPonto.close();
  exploracao.aoAplicar?.();
});
new ResizeObserver(desenharDetalhe).observe(rodaDetalhe);
