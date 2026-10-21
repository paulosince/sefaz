// Fluxos críticos no navegador, com o pacote de conteúdo FICTÍCIO de teste.
import { test, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';

const fixture = readFileSync(new URL('../fixtures/content.json', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.route('**/data/content.json', r => r.fulfill({ body: fixture, contentType: 'application/json' }));
  page.on('pageerror', e => { throw e; });
});

async function enterAs(page, name) {
  await page.goto('/index.html#/perfis');
  await page.getByRole('button', { name: `Entrar como ${name}` }).click();
  await expect(page.locator('main h1')).toContainText(name);
}

async function counts(page) {
  return page.evaluate(async () => {
    const ctx = window.__rumo;
    ctx.invalidate();
    const d = await ctx.data();
    return { answers: d.answers.length, reviews: d.reviews.length, simulados: d.simulados.length };
  });
}

test('responder questão registra no perfil certo e não mistura perfis', async ({ page }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/estudar?subject=s-ti-1');
  await page.locator('.option').first().click();
  await expect(page.locator('.feedback')).toBeVisible();
  expect((await counts(page)).answers).toBe(1);

  await enterAs(page, 'Cíntia');
  expect((await counts(page)).answers).toBe(0);
  await page.goto('/index.html#/materias');
  await expect(page.getByText('Disciplina Orçamento Teste')).toBeVisible();
  await expect(page.getByText('Disciplina TI Teste')).toHaveCount(0);

  await enterAs(page, 'Paulo');
  expect((await counts(page)).answers).toBe(1);
});

test('sair e voltar preserva a posição na sessão de questões', async ({ page }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/estudar?subject=s-comum-1');
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: /Próxima questão/ }).click();
  await expect(page.getByText(/Questão 2 de/)).toBeVisible();
  await page.goto('/index.html#/progresso');
  await page.goto('/index.html#/inicio');
  await expect(page.locator('.continue')).toContainText('questão 2');
  await page.locator('.continue a').click();
  await expect(page.getByText(/Questão 2 de/)).toBeVisible();
});

test('offline: respostas ficam salvas e na fila de sincronização', async ({ page, context }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/estudar?subject=s-ti-1');
  await expect(page.locator('.option').first()).toBeVisible();
  await context.setOffline(true);
  await page.locator('.option').nth(1).click();
  await expect(page.locator('.feedback.bad')).toBeVisible();
  const pending = await page.evaluate(async () => {
    const { pendingOutbox } = await import('./js/data/store.js');
    return (await pendingOutbox(window.__rumo.profile.id)).filter(e => e.table === 'answers').length;
  });
  expect(pending).toBe(1);
  await page.reload().catch(() => {});
  await context.setOffline(false);
});

test('flashcard: revelar, avaliar e sair da fila', async ({ page }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/flashcards');
  const queue = page.getByText(/cartão\(ões\) na fila/);
  const before = parseInt(await queue.textContent());
  await page.getByRole('button', { name: 'Revelar resposta' }).click();
  await page.getByRole('button', { name: /Lembrei/ }).click();
  await expect(queue).toHaveText(new RegExp(`^${before - 1} cartão`));
  expect((await counts(page)).reviews).toBe(1);
});

test('simulado com regras oficiais calcula pontos e diagnóstico', async ({ page }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/simulados');
  await page.locator('label.chip', { hasText: 'P2 completa' }).click();
  await page.getByRole('button', { name: 'Iniciar simulado' }).click();
  await expect(page.getByText(/Questão 1 de 4/)).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.locator('.option').first().click(); // fixture: gabarito A
    if (i < 3) await page.getByRole('button', { name: /Próxima/ }).click();
  }
  await page.getByRole('button', { name: 'Concluir simulado' }).click();
  await expect(page.locator('main h1')).toHaveText('Resultado do simulado');
  await expect(page.locator('.kpi').first()).toContainText('4/4');
  await expect(page.locator('.kpi').nth(2)).toContainText('8');
  const c = await counts(page);
  expect(c.simulados).toBe(1);
  expect(c.answers).toBe(4);
});

test('backup: exportar e importar não duplica', async ({ page }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/estudar?subject=s-ti-1');
  await page.locator('.option').first().click();
  await expect(page.locator('.feedback')).toBeVisible();
  const result = await page.evaluate(async () => {
    const store = await import('./js/data/store.js');
    const id = window.__rumo.profile.id;
    const data = await store.exportBackup(id);
    const again = await store.importBackup(id, data);
    const other = await store.createProfile({ name: 'Restaurado', area: 'C03' });
    const restored = await store.importBackup(other.id, JSON.parse(JSON.stringify(data)));
    return { again, restored, total: (await store.listAnswers(id)).length };
  });
  expect(result.again.answers).toBe(0);
  expect(result.restored.answers).toBe(1);
  expect(result.total).toBe(1);
});

test('busca no edital destaca o termo e mostra a página', async ({ page }) => {
  await enterAs(page, 'Cíntia');
  await page.goto('/index.html#/edital');
  await page.getByLabel('Buscar no edital').fill('orcamento');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('mark').first()).toHaveText('orçamento');
  await expect(page.getByText(/Fonte: edital, página/).first()).toBeVisible();
});

test('plano mostra tarefas e base da priorização', async ({ page }) => {
  await enterAs(page, 'Paulo');
  await page.goto('/index.html#/plano');
  await expect(page.locator('ol .card').first()).toBeVisible();
  await expect(page.getByText('Próximas duas semanas')).toBeVisible();
});

test('layout sem rolagem horizontal', async ({ page }) => {
  await enterAs(page, 'Paulo');
  for (const r of ['inicio', 'plano', 'materias', 'simulados', 'progresso', 'prioridades', 'edital']) {
    await page.goto(`/index.html#/${r}`);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, r).toBeLessThanOrEqual(0);
  }
});
