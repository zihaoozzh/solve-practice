// Vocabulario de cada escenario ecológico.

export interface EnvVar {
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
}

export interface Theme {
  key: string;
  nameEs: string;
  region: string;
  species: string; // plural, minúsculas
  unitWord: string; // "colonias", "peces"...
  juveniles: string; // descripción de los juveniles
  program: string; // "el programa de ..."
  programCap: string;
  siteA: string;
  siteB: string;
  censusName: string;
  monitoringName: string; // serie de otro periodo / método
  cohortName: string;
  envVars: EnvVar[];
  popA: [number, number];
  popB: [number, number]; // en miles
  rateMetric: string; // métrica en % para casos (femenina: "la tasa...")
  subAreas: string[];
  plotWord: string; // femenino singular
  plotPlural: string;
  extraFacts: { label: string; unit: string; min: number; max: number; decimals: number; text: string }[];
}

export const THEMES: Theme[] = [
  {
    key: 'reef',
    nameEs: 'Recuperación de un arrecife',
    region: 'Bahía Casandra',
    species: 'colonias de coral ramificado',
    unitWord: 'colonias',
    juveniles: 'colonias de menos de 5 cm',
    program: 'el programa de trasplante de coral',
    programCap: 'El programa de trasplante de coral',
    siteA: 'Arrecife Farol',
    siteB: 'Bajo Brisa',
    censusName: 'Censo anual del arrecife',
    monitoringName: 'Conteos de transectos de buceo en primavera',
    cohortName: 'Lote de trasplante',
    envVars: [
      { label: 'Temperatura media del mar en superficie', unit: '°C', min: 26, max: 30, decimals: 1 },
      { label: 'Visibilidad media del agua', unit: 'm', min: 8, max: 22, decimals: 1 },
    ],
    popA: [1200, 4800],
    popB: [2.4, 9.6],
    rateMetric: 'incidencia de blanqueamiento',
    subAreas: ['Talud exterior', 'Borde de la laguna', 'Canal', 'Arrecife posterior'],
    plotWord: 'parcela de arrecife',
    plotPlural: 'parcelas de arrecife',
    extraFacts: [
      { label: 'Presupuesto del programa', unit: 'miles de USD', min: 180, max: 950, decimals: 0, text: 'el presupuesto fue de' },
      { label: 'Buceadores voluntarios', unit: 'buceadores', min: 14, max: 60, decimals: 0, text: 'participaron como voluntarios' },
    ],
  },
  {
    key: 'lake',
    nameEs: 'Peces en un lago de montaña',
    region: 'Lago Orvane',
    species: 'salvelinos alpinos',
    unitWord: 'peces',
    juveniles: 'alevines de menos de 1 año',
    program: 'el programa de restauración de gravas de desove',
    programCap: 'El programa de restauración de gravas de desove',
    siteA: 'Cuenca Norte',
    siteB: 'Cuenca Sur',
    censusName: 'Censo anual con redes de enmalle',
    monitoringName: 'Estimaciones de verano con ecosonda',
    cohortName: 'Lote de repoblación',
    envVars: [
      { label: 'Temperatura media del agua en verano', unit: '°C', min: 9, max: 16, decimals: 1 },
      { label: 'Oxígeno disuelto a 10 m', unit: 'mg/L', min: 6, max: 11, decimals: 1 },
    ],
    popA: [900, 4200],
    popB: [2.1, 8.8],
    rateMetric: 'tasa de éxito de desove',
    subAreas: ['Bahía de entrada', 'Fosa profunda', 'Plataforma rocosa', 'Estrecho de salida'],
    plotWord: 'zona de muestreo',
    plotPlural: 'zonas de muestreo',
    extraFacts: [
      { label: 'Grava colocada', unit: 'toneladas', min: 120, max: 900, decimals: 0, text: 'las cuadrillas colocaron un total de' },
      { label: 'Altitud del lago', unit: 'm', min: 1600, max: 2700, decimals: 0, text: 'el lago está a una altitud de' },
    ],
  },
  {
    key: 'desert',
    nameEs: 'Plantas en un desierto',
    region: 'Llanos de Acedera',
    species: 'arbustos de palo fierro',
    unitWord: 'plantas',
    juveniles: 'plántulas de menos de 30 cm',
    program: 'el programa de diques de captación de lluvia',
    programCap: 'El programa de diques de captación de lluvia',
    siteA: 'Mesa Este',
    siteB: 'Mesa Oeste',
    censusName: 'Censo anual de vegetación',
    monitoringName: 'Conteos de copas con dron en otoño',
    cohortName: 'Lote de plantación',
    envVars: [
      { label: 'Precipitación anual', unit: 'mm', min: 90, max: 260, decimals: 0 },
      { label: 'Temperatura media del suelo', unit: '°C', min: 21, max: 34, decimals: 1 },
    ],
    popA: [1500, 6000],
    popB: [3.2, 11.5],
    rateMetric: 'tasa de supervivencia de plántulas',
    subAreas: ['Lecho seco', 'Terraza de grava', 'Margen de dunas', 'Afloramiento rocoso'],
    plotWord: 'parcela de estudio',
    plotPlural: 'parcelas de estudio',
    extraFacts: [
      { label: 'Diques construidos', unit: 'diques', min: 40, max: 320, decimals: 0, text: 'se construyeron' },
      { label: 'Longitud de diques', unit: 'km', min: 4, max: 28, decimals: 1, text: 'la longitud total de los diques alcanzó' },
    ],
  },
  {
    key: 'birds',
    nameEs: 'Migración de aves',
    region: 'Estuario de Halvard',
    species: 'chorlitejos grandes',
    unitWord: 'aves',
    juveniles: 'aves de primer año',
    program: 'el programa de construcción de islas de nidificación',
    programCap: 'El programa de construcción de islas de nidificación',
    siteA: 'Marisma Interior',
    siteB: 'Flecha Exterior',
    censusName: 'Censo anual de reproductores',
    monitoringName: 'Conteos de escala migratoria en otoño',
    cohortName: 'Cohorte anillada',
    envVars: [
      { label: 'Altura media de la marea viva de primavera', unit: 'm', min: 1.2, max: 3.8, decimals: 1 },
      { label: 'Avistamientos de depredadores por semana', unit: 'avistamientos', min: 2, max: 19, decimals: 0 },
    ],
    popA: [700, 3600],
    popB: [1.8, 7.4],
    rateMetric: 'tasa de éxito de nidificación',
    subAreas: ['Banco de guijarros', 'Pradera salina', 'Borde del fangal', 'Cresta de la isla'],
    plotWord: 'unidad censal',
    plotPlural: 'unidades censales',
    extraFacts: [
      { label: 'Islas construidas', unit: 'islas', min: 3, max: 18, decimals: 0, text: 'se construyeron' },
      { label: 'Horas de observación', unit: 'horas', min: 300, max: 2400, decimals: 0, text: 'los equipos de campo registraron un total de' },
    ],
  },
  {
    key: 'pond',
    nameEs: 'Anfibios en charcas restauradas',
    region: 'Turbera de Merrow',
    species: 'tritones moteados',
    unitWord: 'tritones',
    juveniles: 'tritones juveniles',
    program: 'el programa de restauración de charcas',
    programCap: 'El programa de restauración de charcas',
    siteA: 'Charcas del Aliso',
    siteB: 'Charcas del Carrizal',
    censusName: 'Censo anual con trampas de caída',
    monitoringName: 'Conteos nocturnos con linterna',
    cohortName: 'Cohorte de cría asistida',
    envVars: [
      { label: 'pH medio de las charcas', unit: 'unidades de pH', min: 5.8, max: 7.9, decimals: 1 },
      { label: 'Lluvia de primavera', unit: 'mm', min: 120, max: 380, decimals: 0 },
    ],
    popA: [600, 3200],
    popB: [1.5, 6.6],
    rateMetric: 'tasa de supervivencia larvaria',
    subAreas: ['Charca 1', 'Charca 2', 'Charca 3', 'Charca 4'],
    plotWord: 'charca de muestreo',
    plotPlural: 'charcas de muestreo',
    extraFacts: [
      { label: 'Charcas excavadas', unit: 'charcas', min: 6, max: 40, decimals: 0, text: 'se excavaron' },
      { label: 'Vallado instalado', unit: 'm', min: 200, max: 1800, decimals: 0, text: 'el vallado para anfibios instalado sumó' },
    ],
  },
];
