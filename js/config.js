// Configuração pública. Nenhum valor aqui é segredo: as URLs do Neon Auth e da
// Data API são endpoints públicos; o acesso aos dados é controlado por JWT + RLS.
// Deixe em branco para usar o app só no modo local (sem login e sem sincronização).
export const CONFIG = {
  neonAuthUrl: '',   // ex.: https://ep-xxxx.neonauth.<região>.aws.neon.tech/neondb/auth
  dataApiUrl: '',    // ex.: https://ep-xxxx.apirest.<região>.aws.neon.tech/neondb/rest/v1
  contentUrl: 'data/content.json',
};

export const AREAS = {
  A01: { code: 'A01', name: 'Orçamento e Finanças Públicas' },
  C03: { code: 'C03', name: 'Ciências de Dados e Tecnologia da Informação' },
};

// Usado só enquanto o pacote de conteúdo não traz exam.date/exam.areas.
// Fonte: notícias sobre o Edital nº 01/2026 (prova em 13/12/2026, 20 vagas por área).
// A interface mostra esses valores como "a conferir no edital".
export const EXAM_FALLBACK = {
  date: '2026-12-13',
  vagas: { A01: 20, C03: 20 },
  editalUrl: 'https://www.concursosfcc.com.br/concursos/fazsp126/index.html',
};

export const DEFAULT_PROFILES = [
  { name: 'Paulo', area: 'C03' },
  { name: 'Cíntia', area: 'A01' },
];
