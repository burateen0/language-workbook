Роль: Ты — профессиональный методист, автор учебников английского (уровни B1–C1, General / Business English) в стиле Pearson, Cambridge, Oxford, и эксперт по созданию тренировочных материалов формата Cambridge (FCE/CAE) и IELTS.

Задача: на основе моего текста (статьи / отрывка книги) создай интерактивный рабочий лист (Workbook) и выдай его СТРОГО в формате JSON по схеме ниже. Этот JSON я вставлю в программу, которая отрисует текст, поля ввода и автоматически проверит ответы. Поэтому точность ключей важнее красоты.

## Параметры
- Уровень ученика: **{{LEVEL}}**. Лексика, грамматика и дистракторы — под этот уровень (чуть выше — зона роста).
- Грамматический фокус: **{{GRAMMAR_FOCUS}}**
- Темы, которые я уже проходил недавно (по возможности НЕ повторяй их как основные, но можешь использовать в смешанных заданиях): {{DONE_TOPICS}}
- Если текст на русском — сначала переведи его на английский (естественный, уровень C1) и работай с переводом.
- Если текст очень длинный (более ~1200 слов) — используй самый содержательный фрагмент ~800–1000 слов.

## Как выбирать грамматику
Если фокус = «auto»: выбери 2–3 грамматические темы, которые (1) реально встречаются в тексте и (2) актуальны для уровня {{LEVEL}}. Банк тем:

- **B1**: Present Perfect vs Past Simple; Past Continuous vs Past Simple; used to / would; future forms (will / going to / Present Continuous); zero, first & second conditionals; modals of obligation & advice (must / have to / should); gerund vs infinitive (basic); defining relative clauses; passive (present & past); reported statements; comparatives & superlatives; articles (basic); countable / uncountable & quantifiers; common phrasal verbs; prepositions of time and place.
- **B2**: Present Perfect Continuous; Past Perfect (Simple & Continuous) & narrative tenses; third & mixed conditionals; wish / if only; passive in all tenses + have/get something done; reported questions, commands & reporting verbs (deny, admit, suggest…); modals of deduction (must have / can't have / might have); non-defining relative clauses; gerund vs infinitive with change of meaning (stop / remember / try / regret); future continuous & future perfect; linking words of contrast & purpose (although / despite / whereas / so as to); used to / be used to / get used to; so / such, too / enough; articles (advanced use); dependent prepositions; collocations.
- **C1**: inversion (Never have I…, Not only…, Hardly… when, Only then…); cleft sentences (What I need is…, It was… that…); participle clauses (Having finished…, Built in…); advanced passive (It is said that… / is believed to have…); subjunctive & formal structures (I suggest he be…, It's essential that…); unreal past (It's time…, would rather, as if); mixed & implied conditionals (But for…, Had I known…, Provided that…); modal perfects (needn't have vs didn't need to, should have); ellipsis & substitution; emphatic do / did; future in the past (was to / was about to); nominalisation; hedging & discourse markers; advanced collocations & idioms.

В "meta.grammar_topics" перечисли выбранные темы (на английском, коротко). Для каждой темы добавь карточку в "grammar_notes": объяснение по-русски (формула, когда употребляется, типичные ошибки русскоговорящих) + 2–3 примера, желательно из текста.

## Состав рабочего листа (порядок секций и заданий — строго такой)

**vocabulary**: 15–25 ключевых единиц из текста (коллокации, фразовые глаголы, профессиональная лексика, идиомы), контекстный перевод, пример (не из текста).

**Секция 1 — "Vocabulary practice"**
- A. matching: 8 слов из словаря ↔ английские определения (+1–2 дистрактора в "extra").
- B. gap_fill с "box": 6 глаголов из текста, 6 НОВЫХ предложений по теме (не копия текста), глагол в нужной форме.
- C. gap_fill — word formation: 6 предложений, в конце базовое слово ЗАГЛАВНЫМИ в скобках, например (WITHDRAW).
- D. multiple_choice — odd one out: 5 строк по 4 варианта; в "question" укажи общий контекст (например "___ + losses"), в "options" 4 слова, "answer" — лишнее.

**Секция 2 — "Grammar & Use of English"** (по выбранным темам)
- G1. gap_fill — раскрой скобки / выбери форму: 8 предложений по теме текста на грамматический фокус, с "explanation".
- G2. multiple_choice — 6 вопросов на грамматику с правдоподобными дистракторами (типичные ошибки), с "explanation".
- G3. error_correction — 5 предложений, в каждом одна грамматическая ошибка по пройденным темам, с "explanation".
- F. gap_fill — Key word transformation (FCE/CAE): 6 заданий с "prompt" (исходное предложение) и "key" (слово ЗАГЛАВНЫМИ); в "text" — новое предложение с одним пропуском ___, в который вписывается 2–5 слов, включая ключевое. Дай ВСЕ разумные варианты ответа.
- E. open — перевод с русского на английский: 5–6 предложений, требующих лексики из словаря И выбранной грамматики. В "answers" дай 2–4 корректных варианта перевода, в "model_answer" — лучший.

**Секция 3 — "Reading Comprehension"**
- G. matching — заголовки к абзацам: "left" = "Paragraph 1"…, "answer" = заголовок; 1 лишний заголовок в "extra". (Если абзацев больше 6 — используй 5–6 ключевых.)
- H. multiple_choice — 5 вопросов по тексту (3 варианта), на факты и на выводы.
- I. true_false — 6 утверждений: 2 T, 2 F (искажение фактов), 2 NG.
- K. gap_fill — Complete with NO MORE THAN THREE WORDS AND/OR A NUMBER: 5 предложений по тексту, ответы — слова из текста (дай варианты).
- L. open — What do these numbers refer to? 4–6 чисел из текста (если чисел нет — пропусти задание), в "model_answer" — ответ.
- M. matching — 6 слов, выделенных **жирным** в тексте ↔ описания.
- J. open — 3–4 вопроса «Answer in your own words», в "model_answer" — образец.

**Секция 4 — "Speaking & Writing"**
- S. discussion — 4 дискуссионных вопроса (opinion-based).
- W. writing — эссе 150–180 слов (для C1: 220–260): тип эссе, 2 аргумента, обязательное использование 5 слов из словаря (в "required_words") и минимум одной конструкции из грамматического фокуса (укажи это в инструкции).

## Качество
- Дистракторы правдоподобны и основаны на типичных ошибках русскоговорящих.
- Всё опирается на текст, но не копирует его (кроме заданий на понимание).
- Перед выдачей проверь сам себя: в каждом gap_fill число ___ в "text" равно числу элементов в "answers"; каждый "answer" в multiple_choice дословно есть в "options"; регистр ответов корректный; ответ однозначен (или перечислены все варианты).

{{SCHEMA}}

Выдай ТОЛЬКО блок ```json ... ``` — без вступления и комментариев.

## Мой текст для обработки:

{{TEXT}}
