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
 * interfaz, por su nombre en español (ADR-0028). Faltan los que se escriben igual.
 */
export const CATEGORY_TEMPLATE_TRANSLATIONS: Readonly<
  Record<string, Readonly<Partial<Record<'en' | 'ca', string>>>>
> = {
  Ingresos: { en: 'Income', ca: 'Ingressos' },
  Nómina: { en: 'Salary', ca: 'Nòmina' },
  'Ingresos extra': { en: 'Extra income', ca: 'Ingressos extra' },
  Ahorro: { en: 'Savings', ca: 'Estalvi' },
  'Aportación a ahorro': { en: 'Savings deposit', ca: 'Aportació a l’estalvi' },
  'Retirada de ahorro': { en: 'Savings withdrawal', ca: 'Retirada de l’estalvi' },
  'Hipoteca y vivienda': { en: 'Mortgage and housing', ca: 'Hipoteca i habitatge' },
  'Cuota hipoteca': { en: 'Mortgage payment', ca: 'Quota de la hipoteca' },
  'Seguros de la vivienda': { en: 'Home insurance', ca: 'Assegurances de l’habitatge' },
  Impuestos: { en: 'Taxes', ca: 'Impostos' },
  'Préstamos y financiaciones': { en: 'Loans and financing', ca: 'Préstecs i finançaments' },
  Financiaciones: { en: 'Financing', ca: 'Finançaments' },
  'Plataformas y suscripciones': {
    en: 'Platforms and subscriptions',
    ca: 'Plataformes i subscripcions',
  },
  'Donaciones y colaboraciones': { en: 'Donations', ca: 'Donacions i col·laboracions' },
  Otros: { en: 'Other', ca: 'Altres' },
  Suministros: { en: 'Utilities', ca: 'Subministraments' },
  'Comunidad de vecinos': { en: 'Community fees', ca: 'Comunitat de veïns' },
  Luz: { en: 'Electricity', ca: 'Llum' },
  Transporte: { en: 'Transport', ca: 'Transport' },
  'Transporte público': { en: 'Public transport', ca: 'Transport públic' },
  'Financiación coche': { en: 'Car financing', ca: 'Finançament del cotxe' },
  Coche: { en: 'Car', ca: 'Cotxe' },
  Moto: { en: 'Motorbike' },
  Gasolina: { en: 'Fuel', ca: 'Benzina' },
  Variables: { en: 'Variable expenses' },
  'Cuidado personal': { en: 'Personal care', ca: 'Cura personal' },
  Comida: { en: 'Groceries', ca: 'Menjar' },
  Restaurantes: { en: 'Restaurants', ca: 'Restaurants' },
  Hogar: { en: 'Home', ca: 'Llar' },
  Ocio: { en: 'Leisure', ca: 'Oci' },
  Manualidades: { en: 'Crafts', ca: 'Manualitats' },
  Estudios: { en: 'Education', ca: 'Estudis' },
  Ropa: { en: 'Clothing', ca: 'Roba' },
  'Escapadas y viajes': { en: 'Trips and travel', ca: 'Escapades i viatges' },
  Regalos: { en: 'Gifts', ca: 'Regals' },
  Agua: { en: 'Water', ca: 'Aigua' },
  'Internet y móvil': { en: 'Internet and mobile', ca: 'Internet i mòbil' },
  Mascotas: { en: 'Pets', ca: 'Mascotes' },
};

/**
 * Sentencias que traducen las categorías ya cargadas que se llaman como en la plantilla. Las que
 * ya tienen traducción la conservan, así que se pueden repetir tras añadir más categorías.
 */
export function categoryTranslationStatements(): SeedStatement[] {
  return Object.entries(CATEGORY_TEMPLATE_TRANSLATIONS).flatMap(([name, translations]) =>
    Object.entries(translations).map(([language, translation]) => ({
      sql: `INSERT OR IGNORE INTO category_translations (category_id, language, name)
            SELECT id, ?, ? FROM categories WHERE name = ?`,
      bind: [language, translation, name],
    })),
  );
}
