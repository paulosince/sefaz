// Cálculo de pontos conforme as regras da prova carregadas do conteúdo oficial.
// Se as regras não vierem no pacote de conteúdo (exam.rules), nada é inventado:
// as funções devolvem null e a interface mostra só acertos brutos.

/** Provas objetivas que se aplicam à área. */
export function provasForArea(rules, area) {
  if (!rules || !Array.isArray(rules.provas)) return [];
  return rules.provas.filter(p => !p.areas || p.areas.includes(area));
}

/** Pontos máximos que a disciplina vale para a área (questões × peso, somando provas). */
export function subjectPoints(rules, area, subjectId) {
  let total = 0, found = false;
  for (const p of provasForArea(rules, area)) {
    for (const s of p.subjects || []) {
      if (s.subjectId === subjectId) { total += (s.questions || 0) * (s.weight ?? 1); found = true; }
    }
  }
  return found ? total : null;
}

/**
 * Pontua um conjunto de respostas de simulado.
 * answers: [{subject_id, correct}]; devolve por prova e total, ou null sem regras.
 */
export function scoreAttempt(rules, area, answers) {
  const provas = provasForArea(rules, area);
  if (!provas.length) return null;
  const result = { provas: [], total: 0, max: 0 };
  for (const p of provas) {
    const subj = new Map((p.subjects || []).map(s => [s.subjectId, s]));
    let pts = 0, max = 0;
    for (const s of subj.values()) max += (s.questions || 0) * (s.weight ?? 1);
    for (const a of answers) {
      const s = subj.get(a.subject_id);
      if (s && a.correct) pts += s.weight ?? 1;
    }
    result.provas.push({ id: p.id, name: p.name, points: pts, max });
    result.total += pts;
    result.max += max;
  }
  result.habilitacao = checkHabilitacao(rules, result);
  return result;
}

/**
 * Avalia critérios declarados em rules.habilitacao como lista de
 * {type:'min_fraction_prova', prova, value} | {type:'min_fraction_total', value}.
 * Critérios de outro tipo são reportados como "não avaliado".
 */
export function checkHabilitacao(rules, score) {
  const crit = rules && Array.isArray(rules.habilitacao) ? rules.habilitacao : [];
  return crit.map(c => {
    if (c.type === 'min_fraction_prova') {
      const p = score.provas.find(x => x.id === c.prova);
      if (!p || !p.max) return { ...c, ok: null };
      return { ...c, ok: p.points / p.max >= c.value, actual: p.points / p.max };
    }
    if (c.type === 'min_fraction_total') {
      if (!score.max) return { ...c, ok: null };
      return { ...c, ok: score.total / score.max >= c.value, actual: score.total / score.max };
    }
    return { ...c, ok: null };
  });
}
