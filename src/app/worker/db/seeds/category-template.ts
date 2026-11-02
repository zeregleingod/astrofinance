/**
 * Plantilla opcional de categorías del primer arranque (T3.4), sacada de la hoja de gastos
 * mensual del usuario. Los nombres son datos semilla: una vez cargados, el usuario los edita.
 */

type Kind = 'ingreso' | 'gasto' | 'ahorro';

interface TemplateGroup {
  readonly name: string;
  /** Tipo de sus subcategorías; el grupo en sí no tiene tipo. */
  readonly kind: Kind;
  readonly color: string;
  /** Subcategorías: nombre y color propio opcional (si no, hereda el del grupo en la UI). */
  readonly children: readonly (readonly [name: string, color?: string])[];
}

export interface SeedStatement {
  readonly sql: string;
  readonly bind: readonly (string | number | null)[];
}

export const CATEGORY_TEMPLATE: readonly TemplateGroup[] = [
  {
    name: 'Ingresos',
    kind: 'ingreso',
    color: '#2E8B57',
    children: [['Nómina'], ['Ingresos extra']],
  },
  {
    name: 'Ahorro',
    kind: 'ahorro',
    color: '#8C8CE0',
    children: [['Aportación a ahorro'], ['Retirada de ahorro']],
  },
  {
    name: 'Hipoteca y vivienda',
    kind: 'gasto',
    color: '#E9675A',
    children: [['Cuota hipoteca'], ['Seguros de la vivienda'], ['Impuestos']],
  },
  {
    name: 'Préstamos y financiaciones',
    kind: 'gasto',
    color: '#D81BD8',
    children: [
      ['Financiaciones'],
      ['Plataformas y suscripciones'],
      ['Donaciones y colaboraciones'],
      ['Otros'],
    ],
  },
  {
    name: 'Suministros',
    kind: 'gasto',
    color: '#26B5B5',
    children: [['Comunidad de vecinos'], ['Luz']],
  },
  {
    name: 'Transporte',
    kind: 'gasto',
    color: '#F59E0B',
    children: [['Transporte público'], ['Financiación coche'], ['Coche'], ['Moto'], ['Gasolina']],
  },
  {
    name: 'Variables',
    kind: 'gasto',
    color: '#9C3A00',
    children: [
      ['Cuidado personal'],
      ['Comida'],
      ['Restaurantes'],
      ['Hogar'],
      ['Ocio'],
      ['Manualidades'],
      ['Estudios'],
      ['Ropa'],
      ['Escapadas y viajes'],
      ['Regalos'],
    ],
  },
];

const INSERT_GROUP =
  'INSERT INTO categories (parent_id, name, color, sort_order) VALUES (NULL, ?, ?, ?)';

const INSERT_CHILD = `INSERT INTO categories (parent_id, name, kind, color, sort_order)
  SELECT id, ?, ?, ?, ? FROM categories WHERE parent_id IS NULL AND name = ?`;

/** Sentencias parametrizadas para cargar la plantilla; se ejecutan en una transacción. */
export function categoryTemplateStatements(
  template: readonly TemplateGroup[] = CATEGORY_TEMPLATE,
): SeedStatement[] {
  return template.flatMap((group, groupIndex) => [
    { sql: INSERT_GROUP, bind: [group.name, group.color, groupIndex + 1] },
    ...group.children.map(([name, color], childIndex) => ({
      sql: INSERT_CHILD,
      bind: [name, group.kind, color ?? null, childIndex + 1, group.name],
    })),
  ]);
}

/**
 * Los nombres de la plantilla (y de las subcategorías de la demo) en los demás idiomas de la
 * interfaz, por su nombre en español (ADR-0028). También los que se escriben igual: sin ellos,
 * la categoría saldría como «sin traducir».
 */
export const CATEGORY_TEMPLATE_TRANSLATIONS: Readonly<
  Record<string, Readonly<Partial<Record<'ca' | 'en', string>>>>
> = {
  Ingresos: { ca: 'Ingressos', en: 'Income' },
  Nómina: { ca: 'Nòmina', en: 'Salary' },
  'Ingresos extra': { ca: 'Ingressos extra', en: 'Extra income' },
  Ahorro: { ca: 'Estalvi', en: 'Savings' },
  'Aportación a ahorro': { ca: 'Aportació a l’estalvi', en: 'Savings deposit' },
  'Retirada de ahorro': { ca: 'Retirada de l’estalvi', en: 'Savings withdrawal' },
  'Hipoteca y vivienda': { ca: 'Hipoteca i habitatge', en: 'Mortgage and housing' },
  'Cuota hipoteca': { ca: 'Quota de la hipoteca', en: 'Mortgage payment' },
  'Seguros de la vivienda': { ca: 'Assegurances de l’habitatge', en: 'Home insurance' },
  Impuestos: { ca: 'Impostos', en: 'Taxes' },
  'Préstamos y financiaciones': { ca: 'Préstecs i finançaments', en: 'Loans and financing' },
  Financiaciones: { ca: 'Finançaments', en: 'Financing' },
  'Plataformas y suscripciones': {
    ca: 'Plataformes i subscripcions',
    en: 'Platforms and subscriptions',
  },
  'Donaciones y colaboraciones': { ca: 'Donacions i col·laboracions', en: 'Donations' },
  Otros: { ca: 'Altres', en: 'Other' },
  Suministros: { ca: 'Subministraments', en: 'Utilities' },
  'Comunidad de vecinos': { ca: 'Comunitat de veïns', en: 'Community fees' },
  Luz: { ca: 'Llum', en: 'Electricity' },
  Transporte: { ca: 'Transport', en: 'Transport' },
  'Transporte público': { ca: 'Transport públic', en: 'Public transport' },
  'Financiación coche': { ca: 'Finançament del cotxe', en: 'Car financing' },
  Coche: { ca: 'Cotxe', en: 'Car' },
  Moto: { ca: 'Moto', en: 'Motorbike' },
  Gasolina: { ca: 'Benzina', en: 'Fuel' },
  Variables: { ca: 'Variables', en: 'Variable expenses' },
  'Cuidado personal': { ca: 'Cura personal', en: 'Personal care' },
  Comida: { ca: 'Menjar', en: 'Groceries' },
  Restaurantes: { ca: 'Restaurants', en: 'Restaurants' },
  Hogar: { ca: 'Llar', en: 'Home' },
  Ocio: { ca: 'Oci', en: 'Leisure' },
  Manualidades: { ca: 'Manualitats', en: 'Crafts' },
  Estudios: { ca: 'Estudis', en: 'Education' },
  Ropa: { ca: 'Roba', en: 'Clothing' },
  'Escapadas y viajes': { ca: 'Escapades i viatges', en: 'Trips and travel' },
  Regalos: { ca: 'Regals', en: 'Gifts' },
  Agua: { ca: 'Aigua', en: 'Water' },
  'Internet y móvil': { ca: 'Internet i mòbil', en: 'Internet and mobile' },
  Mascotas: { ca: 'Mascotes', en: 'Pets' },
};

/**
 * Sentencias que traducen las categorías ya cargadas que se llaman en español como en la
 * plantilla. Las que ya tienen traducción la conservan, así que se pueden repetir tras añadir más
 * categorías.
 */
export function categoryTranslationStatements(): SeedStatement[] {
  return Object.entries(CATEGORY_TEMPLATE_TRANSLATIONS).flatMap(([name, translations]) =>
    Object.entries(translations).map(([language, translation]) => ({
      sql: `INSERT OR IGNORE INTO category_translations (category_id, language, name)
            SELECT id, ?, ? FROM categories WHERE name = ? AND language = 'es'`,
      bind: [language, translation, name],
    })),
  );
}
