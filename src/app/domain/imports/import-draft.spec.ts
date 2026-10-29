import { sabadellSheet } from '../../../testing/sabadell-sheet';
import { parseStatement } from './bank-profiles';
import {
  countSuggested,
  createDraft,
  draftAmountCents,
  draftErrors,
  draftToBatch,
  editDraft,
  isEdited,
  summarizeDraft,
  suggestionInUse,
} from './import-draft';
import { prepareImport } from './imported-statement';

describe('borrador de importación', () => {
  const statement = prepareImport(parseStatement(sabadellSheet()), {
    name: 'enero.xls',
    sha256: 'f'.repeat(64),
  });
  const hashOf = (index: number) => statement.movements[index]?.dedupeHash ?? '';
  const fresh = () => createDraft(statement, new Set());

  it('parte de los datos del banco, con todo incluido', () => {
    const draft = fresh();

    expect(draft).toHaveLength(statement.movements.length);
    expect(draft[1]).toMatchObject({
      duplicate: false,
      included: true,
      description: 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
      amountText: '-557,46',
      categoryId: null,
      suggestion: null,
      note: '',
    });
    expect(draft.every((row) => draftErrors(row).length === 0 && !isEdited(row))).toBe(true);
    expect(summarizeDraft(draft)).toEqual({
      total: 8,
      toSave: 8,
      duplicates: 0,
      excluded: 0,
      invalid: 0,
    });
  });

  it('marca como duplicados los ya guardados y no deja incluirlos', () => {
    const draft = createDraft(statement, new Set([hashOf(0), hashOf(2)]));

    expect(draft.map((row) => row.duplicate)).toEqual([true, false, true, ...Array(5).fill(false)]);
    expect(draft[0]?.included).toBe(false);
    expect(editDraft(draft, 0, { included: true })[0]?.included).toBe(false);
    expect(summarizeDraft(draft)).toMatchObject({ toSave: 6, duplicates: 2, excluded: 0 });
  });

  it('editar no muta el borrador y solo cambia la fila indicada', () => {
    const draft = fresh();
    const edited = editDraft(draft, 2, { description: 'Nómina', categoryId: 7, note: ' enero ' });

    expect(draft[2]?.description).toBe('NOMINA DE EMPRESA DEMO SL');
    expect(edited[2]).toMatchObject({ description: 'Nómina', categoryId: 7, included: true });
    expect(edited[3]).toBe(draft[3]);
    expect(edited[2] && isEdited(edited[2])).toBe(true);
  });

  it('valida concepto, importe y observaciones de las filas incluidas', () => {
    let draft = fresh();
    draft = editDraft(draft, 0, { description: '   ' });
    draft = editDraft(draft, 1, { amountText: 'mucho' });
    draft = editDraft(draft, 2, { amountText: '0,00' });
    draft = editDraft(draft, 3, { note: 'n'.repeat(501), description: 'd'.repeat(501) });
    draft = editDraft(draft, 4, { amountText: '-2,00' });

    expect(draft.slice(0, 5).map(draftErrors)).toEqual([
      ['description'],
      ['amount'],
      ['amount'],
      ['description', 'note'],
      [],
    ]);
    expect(draft[4] && draftAmountCents(draft[4])).toBe(-200);
    expect(draft[4] && isEdited(draft[4])).toBe(true);
    expect(summarizeDraft(draft)).toMatchObject({ toSave: 4, invalid: 4 });
    expect(() => draftToBatch(statement, draft)).toThrow(RangeError);

    // Una fila excluida deja de bloquear el guardado.
    const excluded = [0, 1, 2, 3].reduce(
      (rows, i) => editDraft(rows, i, { included: false }),
      draft,
    );
    expect(excluded.slice(0, 4).map(draftErrors)).toEqual([[], [], [], []]);
    expect(summarizeDraft(excluded)).toMatchObject({ toSave: 4, excluded: 4, invalid: 0 });
  });

  it('genera el lote con lo editado y conserva el concepto y la huella originales', () => {
    let draft = createDraft(statement, new Set([hashOf(7)]));
    draft = editDraft(draft, 0, { included: false });
    draft = editDraft(draft, 5, {
      description: '  Luz de enero ',
      amountText: '-70',
      categoryId: 12,
      note: ' Revisar ',
    });

    const batch = draftToBatch(statement, draft);

    expect(batch).toMatchObject({
      profileId: 'sabadell',
      institution: 'Banc Sabadell',
      ibanLast4: '4321',
      fileName: 'enero.xls',
      fileSha256: 'f'.repeat(64),
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      openingBalanceCents: 100000,
      duplicateCount: 1,
      errorCount: 0,
    });
    expect(batch.rows).toHaveLength(6);
    expect(batch.rows.find((row) => row.dedupeHash === hashOf(5))).toEqual({
      opDate: '2026-01-09',
      valueDate: '2026-01-09',
      amountCents: -7000,
      balanceAfterCents: 101449,
      description: 'Luz de enero',
      originalDescription: 'ADEUDO RECIBO LUZ DEMO',
      descriptionSource: 'manual',
      note: 'Revisar',
      bankReference: 'REF-LUZ',
      categoryId: 12,
      categorySource: 'manual',
      ruleId: null,
      dedupeHash: hashOf(5),
    });
    expect(batch.rows[0]).toMatchObject({
      description: 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
      originalDescription: 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
      descriptionSource: 'banco',
      note: null,
      categoryId: null,
      categorySource: 'ninguna',
      ruleId: null,
    });
  });

  describe('conceptos propuestos por las reglas de concepto', () => {
    const proposed = () =>
      createDraft(statement, new Set([hashOf(1)]), [], ['Préstamo', 'Otro', '', 'Luz']);
    const rowOf = (draft: ReturnType<typeof proposed>, index: number) =>
      draftToBatch(statement, draft).rows.find((row) => row.dedupeHash === hashOf(index));

    it('vienen puestos, salvo en los ya guardados, y se guardan con su origen', () => {
      const draft = proposed();

      expect(draft[0]?.description).toBe('Préstamo');
      expect(draft[1]?.description).toBe(draft[1]?.movement.description);
      expect(rowOf(draft, 0)).toMatchObject({
        description: 'Préstamo',
        descriptionSource: 'regla',
      });
      expect(rowOf(draft, 2)).toMatchObject({ descriptionSource: 'banco' });
    });

    it('lo que escribe el usuario es suyo, y volver al del banco lo deja como del banco', () => {
      let draft = editDraft(proposed(), 3, { description: 'Factura de la luz' });
      expect(rowOf(draft, 3)).toMatchObject({ descriptionSource: 'manual' });

      draft = editDraft(draft, 3, { description: draft[3]?.movement.description ?? '' });
      expect(rowOf(draft, 3)).toMatchObject({ descriptionSource: 'banco' });
    });
  });

  describe('categorías propuestas', () => {
    const byRule = { source: 'regla', categoryId: 3, ruleId: 9 } as const;
    const byHistory = { source: 'sugerencia', categoryId: 5 } as const;
    const suggested = () =>
      createDraft(statement, new Set([hashOf(1)]), [byRule, byHistory, null, byHistory]);
    const rowOf = (draft: ReturnType<typeof suggested>, index: number) =>
      draftToBatch(statement, draft).rows.find((row) => row.dedupeHash === hashOf(index));

    it('vienen puestas, salvo en los ya guardados, y se guardan con su origen', () => {
      const draft = suggested();

      expect(draft.slice(0, 4).map((row) => row.categoryId)).toEqual([3, null, null, 5]);
      expect(draft[1]?.suggestion).toBeNull();
      expect(countSuggested(draft)).toEqual({ byRule: 1, byHistory: 1 });
      expect(rowOf(draft, 0)).toMatchObject({ categoryId: 3, categorySource: 'regla', ruleId: 9 });
      expect(rowOf(draft, 2)).toMatchObject({ categoryId: null, categorySource: 'ninguna' });
      expect(rowOf(draft, 3)).toMatchObject({
        categoryId: 5,
        categorySource: 'sugerencia',
        ruleId: null,
      });
    });

    it('si el usuario cambia la propuesta, la categoría pasa a ser suya', () => {
      let draft = editDraft(suggested(), 3, { categoryId: 8 });
      expect(draft[3] && suggestionInUse(draft[3])).toBeNull();
      expect(countSuggested(draft)).toEqual({ byRule: 1, byHistory: 0 });
      expect(rowOf(draft, 3)).toMatchObject({ categoryId: 8, categorySource: 'manual' });

      // Volver a la propuesta la recupera; quitar la categoría la deja sin ninguna.
      draft = editDraft(draft, 3, { categoryId: 5 });
      expect(rowOf(draft, 3)).toMatchObject({ categorySource: 'sugerencia' });
      draft = editDraft(draft, 0, { categoryId: null });
      expect(rowOf(draft, 0)).toMatchObject({ categorySource: 'ninguna', ruleId: null });
    });

    it('las filas descartadas no cuentan como propuestas', () => {
      const draft = editDraft(suggested(), 0, { included: false });
      expect(countSuggested(draft)).toEqual({ byRule: 0, byHistory: 1 });
    });
  });
});
