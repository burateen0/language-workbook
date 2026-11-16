'use strict';
/* Профили языков: уровни, грамматические банки (для кнопок на главной и для промта),
   методические заметки для ИИ, озвучка, спецсимволы. */

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

window.LANGS = {
  en: {
    code: 'en', badge: 'EN', name: 'Английский', gen: 'английского', native: 'English', hue: 210,
    tts: 'en-GB', script: 'latin', engine: 'alpha', contractions: true,
    levels: CEFR, defLevel: 'B2', levelSystem: 'CEFR', exams: 'Cambridge (KET/PET/FCE/CAE/CPE), IELTS',
    chars: [],
    grammar: {
      A1: ['to be / have got', 'Present Simple', 'Present Continuous', 'there is / there are', 'Articles a/an/the', 'Plural nouns', 'can / can\'t', 'Possessive adjectives', 'Prepositions of place', 'Imperatives', 'Question words', 'this / that / these / those'],
      A2: ['Past Simple (regular & irregular)', 'Present Simple vs Continuous', 'going to / will', 'Comparatives & superlatives', 'have to / must / should', 'Countable / uncountable', 'Present Perfect (ever/never)', 'Prepositions of time', 'Adverbs of frequency', 'Past Continuous', 'Object pronouns', 'too / enough'],
      B1: ['Present Perfect vs Past Simple', 'used to / would', 'Future forms', 'First & second conditionals', 'Modals of obligation & advice', 'Gerund vs infinitive', 'Defining relative clauses', 'Passive (present/past)', 'Reported statements', 'Quantifiers', 'Articles', 'Phrasal verbs'],
      B2: ['Present Perfect Continuous', 'Narrative tenses / Past Perfect', 'Third & mixed conditionals', 'wish / if only', 'Passive + have something done', 'Reporting verbs', 'Modals of deduction (past)', 'Non-defining relative clauses', 'Gerund vs infinitive (meaning change)', 'Future continuous & perfect', 'Linking words: contrast & purpose', 'be used to / get used to', 'so / such, too / enough', 'Dependent prepositions'],
      C1: ['Inversion', 'Cleft sentences', 'Participle clauses', 'Advanced passive (It is said that…)', 'Subjunctive', 'Unreal past (It\'s time, would rather)', 'Implied conditionals (But for, Had I…)', 'Modal perfects (needn\'t have)', 'Ellipsis & substitution', 'Emphatic do/did', 'Future in the past', 'Nominalisation', 'Hedging & discourse markers', 'Advanced collocations'],
      C2: ['Fronting & inversion for emphasis', 'Pseudo-cleft variety', 'Formal subjunctive & register', 'Complex noun phrases', 'Absolute constructions', 'Modal nuance (might well, could hardly)', 'Idiomatic phrasal verbs', 'Hedging & stance', 'Cohesion & reference', 'Collocational precision', 'Irony & understatement', 'Word formation (advanced)'],
    },
    notes: `Стиль заданий — Cambridge / IELTS. Типичные ошибки русскоговорящих: артикли, система времён (Present Perfect vs Past Simple), предлоги и зависимые предлоги, порядок слов в вопросах, false friends. Для B2+ обязательно задание Key word transformation (FCE/CAE). Словарь: коллокации, фразовые глаголы; глаголы — в форме "to + глагол"; поле "ipa" — транскрипция (по желанию). Регистр важен: I, имена, дни, месяцы, национальности — с заглавной.`,
  },
  de: {
    code: 'de', badge: 'DE', name: 'Немецкий', gen: 'немецкого', native: 'Deutsch', hue: 38,
    tts: 'de-DE', script: 'latin', engine: 'alpha', genders: { m: 'der', f: 'die', n: 'das' },
    levels: CEFR, defLevel: 'A2', levelSystem: 'CEFR', exams: 'Goethe-Zertifikat, telc, TestDaF, ÖSD',
    chars: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'],
    grammar: {
      A1: ['sein / haben', 'Präsens (regelmäßig/unregelmäßig)', 'Artikel der/die/das, ein/kein', 'Nominativ & Akkusativ', 'Verbposition (V2)', 'W-Fragen & Ja/Nein-Fragen', 'Trennbare Verben', 'Modalverben (können, müssen, wollen)', 'Possessivartikel', 'Negation nicht / kein', 'Plural der Nomen', 'Imperativ'],
      A2: ['Perfekt mit haben / sein', 'Dativ (Artikel & Pronomen)', 'Präpositionen mit Dativ / Akkusativ', 'Wechselpräpositionen', 'Nebensätze: weil / dass / wenn', 'Komparativ & Superlativ', 'Reflexive Verben', 'Präteritum: sein, haben, Modalverben', 'Adjektivdeklination (Grundlagen)', 'Konjunktiv II höflich (hätte gern, könnten Sie)', 'Uhrzeit & Zeitangaben', 'Verben mit Dativ'],
      B1: ['Präteritum', 'Plusquamperfekt', 'Passiv Präsens / Präteritum', 'Relativsätze', 'Konjunktiv II (Wünsche, Ratschläge)', 'Infinitiv mit zu', 'um…zu / damit', 'Genitiv', 'Adjektivdeklination (alle Typen)', 'obwohl / trotzdem', 'Verben mit Präpositionen (da-/wo-Wörter)', 'als / wenn / wann'],
      B2: ['Passiv mit Modalverben', 'Konjunktiv II Vergangenheit', 'Konjunktiv I (indirekte Rede)', 'Partizipialattribute', 'Nominalisierung', 'je…desto, sowohl…als auch, weder…noch', 'Präpositionen mit Genitiv (wegen, trotz, während)', 'Modalverben subjektiv (soll, muss… haben)', 'lassen + Infinitiv', 'Passiversatz (sich lassen, -bar)', 'Futur II', 'Relativsätze mit was / wo(r)-'],
      C1: ['Erweiterte Partizipialattribute', 'Nominalstil vs. Verbalstil', 'Konjunktiv I in Berichten', 'Funktionsverbgefüge', 'Modalpartikeln (doch, ja, eben, halt)', 'Konnektoren: indem, sofern, zumal', 'Satzklammer & Ausklammerung', 'Konditionalsätze ohne wenn (Hätte ich…)', 'Wortbildung (Präfixe / Suffixe)', 'Feste Präpositionen', 'Redewendungen', 'Textkohärenz'],
      C2: ['Stilebenen & Register', 'Idiomatik & feste Wendungen', 'Komplexe Satzgefüge', 'Feinheiten der Modalpartikeln', 'Wortstellung zur Emphase', 'Fachsprache & Nominalstil', 'Ironie & Modalität', 'Archaische Formen'],
    },
    notes: `Стиль заданий — Goethe-Zertifikat / telc. Типичные ошибки русскоговорящих: род и артикль существительных, падежные окончания (Akkusativ/Dativ, склонение прилагательных), место глагола (V2, глагол в конце придаточного, рамочная конструкция), отделяемые приставки, haben/sein в Perfekt, предлоги с падежами. ОБЯЗАТЕЛЬНО: существительные всегда с заглавной буквы; в словаре существительные пиши с артиклем ("der Tisch"), поле "gender" = "m"/"f"/"n", "plural" = форма мн. числа ("die Tische"); у сильных глаголов в "plural" можно дать 3 формы ("gehen – ging – ist gegangen"). Обязательно добавь задание на артикли/род (multiple_choice der/die/das) для A1–B1 и задание word_order на порядок слов. Умлауты и ß пиши правильно — программа отдельно проверяет диакритику.`,
  },
  fr: {
    code: 'fr', badge: 'FR', name: 'Французский', gen: 'французского', native: 'Français', hue: 228,
    tts: 'fr-FR', script: 'latin', engine: 'alpha', genders: { m: 'm', f: 'f' },
    levels: CEFR, defLevel: 'A2', levelSystem: 'CEFR', exams: 'DELF / DALF, TCF',
    chars: ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'œ', 'É', 'À', '«', '»'],
    grammar: {
      A1: ['être / avoir', 'Présent (-er, -ir, irréguliers)', 'Articles défini / indéfini', 'Genre & nombre', 'Négation ne…pas', 'Questions (est-ce que, inversion)', 'Adjectifs possessifs', 'Accord de l\'adjectif', 'Futur proche (aller + inf.)', 'Prépositions + villes / pays', 'Il y a', 'Verbes pronominaux'],
      A2: ['Passé composé (avoir / être)', 'Imparfait', 'Articles partitifs (du, de la, de)', 'Pronoms COD / COI', 'Comparatif & superlatif', 'Futur simple', 'Pronoms y et en', 'Impératif', 'Négations (rien, jamais, plus)', 'Pronoms relatifs qui / que', 'Adverbes en -ment', 'Venir de / être en train de'],
      B1: ['Passé composé vs imparfait', 'Plus-que-parfait', 'Conditionnel présent', 'Subjonctif présent', 'Pronoms relatifs dont / où', 'Discours indirect', 'Accord du participe passé', 'Si + imparfait', 'Gérondif', 'Pronoms démonstratifs', 'Cause & conséquence', 'Doubles pronoms'],
      B2: ['Subjonctif (doute, émotion, concession)', 'Conditionnel passé', 'Si + plus-que-parfait', 'Voix passive', 'Concordance des temps', 'Lequel, auquel, duquel', 'Participe présent & adjectif verbal', 'bien que, pourvu que, à moins que', 'Mise en relief (c\'est… qui/que)', 'Nominalisation', 'Futur antérieur', 'Discours rapporté au passé'],
      C1: ['Passé simple (reconnaissance)', 'Subjonctif passé', 'Infinitif passé', 'Accords complexes du participe', 'Inversion stylistique', 'Ne explétif', 'Registres de langue', 'Expressions idiomatiques', 'Concession & opposition', 'Tournures impersonnelles', 'Articulateurs argumentatifs', 'Périphrases verbales'],
      C2: ['Subjonctif imparfait (reconnaissance)', 'Style soutenu & littéraire', 'Figures de style', 'Paronymes & nuances lexicales', 'Ellipse & ironie', 'Syntaxe complexe', 'Expressions figées', 'Registre familier / argot'],
    },
    notes: `Стиль заданий — DELF / DALF. Типичные ошибки русскоговорящих: род существительных и согласование прилагательных, артикли (включая партитивные), passé composé vs imparfait, выбор être/avoir и согласование participe passé, место местоимений (COD/COI, y, en), subjonctif после выражений. ОБЯЗАТЕЛЬНО: все accents (é, è, ê, à, ç…) пиши правильно — программа отдельно проверяет диакритику; элизию (l', j', qu') — с обычным апострофом '. В словаре существительные пиши с артиклем ("la maison", "l'arbre"), поле "gender" = "m"/"f" (особенно при l'). Добавь задание на род/артикль для A1–B1. Знаки ; : ! ? можно писать с пробелом или без — программа это игнорирует.`,
  },
  it: {
    code: 'it', badge: 'IT', name: 'Итальянский', gen: 'итальянского', native: 'Italiano', hue: 160,
    tts: 'it-IT', script: 'latin', engine: 'alpha', genders: { m: 'm', f: 'f' },
    levels: CEFR, defLevel: 'A2', levelSystem: 'CEFR', exams: 'CELI, CILS, PLIDA',
    chars: ['à', 'è', 'é', 'ì', 'ò', 'ù', 'È'],
    grammar: {
      A1: ['essere / avere', 'Presente (-are, -ere, -ire)', 'Articoli determinativi / indeterminativi', 'Genere e numero', 'Accordo dell\'aggettivo', 'Preposizioni semplici', 'C\'è / ci sono', 'Verbi irregolari (andare, fare, venire)', 'Possessivi', 'Negazione', 'Verbi riflessivi', 'Domande'],
      A2: ['Passato prossimo (essere / avere)', 'Preposizioni articolate', 'Imperfetto', 'Pronomi diretti', 'Pronomi indiretti', 'Futuro semplice', 'Comparativi e superlativi', 'Stare + gerundio', 'Ci e ne', 'Imperativo', 'Partitivo (del, della)', 'Volerci / metterci'],
      B1: ['Passato prossimo vs imperfetto', 'Trapassato prossimo', 'Condizionale presente', 'Congiuntivo presente', 'Pronomi combinati (glielo, me ne)', 'Pronomi relativi (che, cui)', 'Periodo ipotetico (1° e 2° tipo)', 'Accordo del participio passato', 'Discorso indiretto', 'Si impersonale / passivante', 'Gerundio', 'Futuro anteriore'],
      B2: ['Congiuntivo imperfetto e trapassato', 'Concordanza dei tempi', 'Periodo ipotetico (3° tipo, misto)', 'Passivo (essere / venire / andare)', 'Condizionale passato', 'Pronomi relativi (il quale, chi)', 'benché, affinché, purché', 'Passato remoto (riconoscimento)', 'Infinito passato', 'Nominalizzazione', 'Verbi pronominali (farcela, andarsene)', 'Discorso indiretto al passato'],
      C1: ['Passato remoto', 'Congiuntivo in frasi indipendenti', 'Costruzioni implicite', 'Registro formale', 'Connettivi testuali', 'Dislocazione', 'Frase scissa', 'Espressioni idiomatiche', 'Verbi con preposizioni', 'Alterati (-ino, -one, -accio)', 'Tempi del racconto', 'Forme impersonali'],
      C2: ['Stile letterario', 'Registri e varietà', 'Lessico specialistico', 'Figure retoriche', 'Sfumature modali', 'Proverbi ed espressioni fisse', 'Sintassi complessa', 'Forme letterarie e arcaismi'],
    },
    notes: `Стиль заданий — CELI / CILS / PLIDA. Типичные ошибки русскоговорящих: артикли (il/lo/l'/la/i/gli/le) и preposizioni articolate, выбор essere/avere в passato prossimo и согласование participio, passato prossimo vs imperfetto, congiuntivo, местоимения (combinati, ci, ne), двойные согласные. ОБЯЗАТЕЛЬНО: ударения пиши правильно (è ≠ e, perché, città, più) — программа отдельно проверяет диакритику; элизию (l', un') — с обычным апострофом '. В словаре существительные пиши с артиклем ("la casa", "lo studente"), поле "gender" = "m"/"f". Добавь задание на артикли/предлоги для A1–B1.`,
  },
  zh: {
    code: 'zh', badge: '中', name: 'Китайский', gen: 'китайского', native: '中文', hue: 4,
    tts: 'zh-CN', script: 'han', engine: 'zh',
    levels: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'], defLevel: 'HSK3', levelSystem: 'HSK 3.0', exams: 'HSK 3.0',
    levelInfo: { HSK1: '≈500 слов', HSK2: '≈1270 слов', HSK3: '≈2245 слов', HSK4: '≈3245 слов', HSK5: '≈4316 слов', HSK6: '≈5456 слов' },
    chars: [],
    grammar: {
      HSK1: ['是 / 有', 'Вопросы с 吗 и 呢', 'Вопросительные слова', '的 (принадлежность)', '不 vs 没', 'Счётные слова 个/本/口', '在 (место)', '想 / 会 / 能', 'Порядок: время и место', '了 (завершённость)', '太…了', '也 / 都'],
      HSK2: ['过 (опыт)', '正在…呢', '要…了', 'Сравнение с 比', '是…的', 'Дополнение степени 得', '因为…所以', '虽然…但是', '就 vs 才', '一…就', '已经…了', 'Удвоение глаголов', '还是 vs 或者', 'Направление 来 / 去'],
      HSK3: ['把字句', '被 (пассив)', 'Дополнение результата', 'Дополнение возможности', 'Сложные дополнения направления', '越来越 / 越…越', '一边…一边', '除了…以外', '只要…就', '如果…就', '着 (состояние)', '又…又', '先…再…然后', '连…都/也'],
      HSK4: ['无论…都', '即使…也', '不但…而且', '既…又', '尽管', '由于', '对于 / 关于', '不得不', '难道', '竟然', '并 + отрицание', '甚至', '只有…才', '起来/下去/出来 (перенос.)'],
      HSK5: ['与其…不如', '宁可…也不', '何必', '未必', '不至于', '毕竟', '以免 / 免得', '一旦', '之所以…是因为', '万一', '简直', '反而', '在…下', 'Синонимы 近义词'],
      HSK6: ['固然', '鉴于', '势必', '以至于', '况且', '不免', '莫非', '何尝', '与其说…不如说', '致使 / 进而', '而 (союз)', '之 / 其 / 以', 'Чэнъюи 成语', 'Письменный стиль 书面语'],
    },
    notes: '',
  },
};
window.LANG_ORDER = ['en', 'de', 'fr', 'it', 'zh'];
