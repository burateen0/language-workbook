## ФОРМАТ JSON (схема englishtest/v1) — соблюдай строго

### Правила JSON
- Выдай ровно ОДИН JSON-объект в одном блоке ```json ... ```. Без комментариев внутри JSON, без висячих запятых.
- Внутри строк используй обычный апостроф ' (не ’), двойные кавычки внутри строк экранируй: \".
- Пропуск в предложении обозначай ровно тремя подчёркиваниями: ___ (один ___ = одно поле ввода). Никаких других подчёркиваний в тексте.
- Ответы пиши С ПРАВИЛЬНЫМ РЕГИСТРОМ — ровно так, как слово должно стоять в предложении: имена собственные, I, названия дней/месяцев/национальностей и начало предложения — с заглавной, всё остальное — строчными. Регистр проверяется программой.
- Если допустимо несколько правильных ответов — перечисли ВСЕ разумные варианты в массиве (например ["has been working", "has worked"]). Сокращённые/полные формы (don't / do not, I'm / I am) перечислять не нужно — программа приравнивает их сама.
- "answer" в multiple_choice и matching — это ТОЧНАЯ копия текста правильного варианта (не буква и не номер).
- Поле "explanation" (необязательное, на русском, 1–2 предложения) показывается ученику после проверки — добавляй его к грамматическим заданиям.

### Корневая структура
```json
{
  "schema": "englishtest/v1",
  "meta": {
    "title": "Короткое название теста (рус. или англ.)",
    "level": "B2",
    "topic": "Тема текста",
    "round": 1,
    "grammar_topics": ["Mixed conditionals", "Passive reporting structures"]
  },
  "text": {
    "title": "Article title",
    "paragraphs": ["Paragraph 1 ...", "Paragraph 2 ..."]
  },
  "review": null,
  "vocabulary": [
    {"en": "to launder money", "in_text": "laundered", "ru": "отмывать деньги", "example": "The gang laundered millions through shell companies."}
  ],
  "grammar_notes": [
    {"title": "Mixed conditionals", "explanation": "Короткое объяснение правила по-русски: когда используется, формула, ловушки.", "examples": ["If I had taken the job, I would be rich now."]}
  ],
  "sections": [
    {"title": "Vocabulary practice", "tasks": [ /* задания, см. ниже */ ]}
  ]
}
```
- "text.paragraphs": текст статьи, разбитый на абзацы. Слова для задания «words in bold» выдели в тексте как **word**.
- "vocabulary[].in_text": форма слова/фразы ровно как в тексте (для подсветки). Если фразы в тексте нет — пустая строка.
- "review": в первом раунде null. В раундах повторения — объект (см. ниже).

### Типы заданий (поле "type")
Общие поля у каждого задания: "id" (буква/код: "A", "B", "G1"…), "type", "title", "instruction" (инструкция на английском, как в учебнике), "items".

1) gap_fill — поля ввода в пропусках (лексика, формы глаголов, word formation, key word transformation, NO MORE THAN THREE WORDS):
```json
{"id": "B", "type": "gap_fill", "title": "Verbs in context", "instruction": "Complete the sentences with the correct form of a verb from the box.",
 "box": ["suspend", "launch", "comply"],
 "items": [
   {"text": "The regulator ___ the company's licence last week.", "answers": [["suspended"]]},
   {"text": "If they ___ (comply) with the rules, they ___ (not / be) fined.", "answers": [["had complied"], ["wouldn't have been", "would not have been"]], "explanation": "Third conditional: If + Past Perfect, would have + V3."},
   {"prompt": "Binance stopped all transactions for a time.", "key": "SUSPENDED", "text": "Binance ___ for a time.", "answers": [["suspended all transactions"]]}
 ]}
```
   - "answers": массив, по одному элементу на каждый ___ в "text"; каждый элемент — массив допустимых вариантов.
   - "prompt" (необязательно) — исходное предложение (для key word transformation); "key" — ключевое слово ЗАГЛАВНЫМИ.
   - Для word formation пиши базовое слово в скобках в конце: "... ___ of funds. (WITHDRAW)".

2) multiple_choice — выбор одного варианта (вопросы по тексту, грамматика, odd one out):
```json
{"id": "H", "type": "multiple_choice", "title": "...", "instruction": "Choose the correct option.",
 "items": [{"question": "Why did ...?", "options": ["because ...", "since ...", "although ..."], "answer": "because ...", "explanation": "..."}]}
```

3) true_false — True / False / Not Given:
```json
{"id": "I", "type": "true_false", "title": "...", "instruction": "...", "options": ["T", "F", "NG"],
 "items": [{"statement": "...", "answer": "NG"}]}
```

4) matching — сопоставление (слово ↔ определение, абзац ↔ заголовок). Правая колонка перемешивается программой автоматически:
```json
{"id": "A", "type": "matching", "title": "...", "instruction": "Match the words (1-8) with their meanings (a-h).",
 "items": [{"left": "to comply with", "answer": "to act according to a rule or order"}],
 "extra": ["лишний правдоподобный вариант-дистрактор (необязательно)"]}
```

5) error_correction — в предложении есть ошибка, ученик переписывает предложение целиком исправленным:
```json
{"id": "G3", "type": "error_correction", "title": "...", "instruction": "Each sentence contains one mistake. Rewrite it correctly.",
 "items": [{"text": "If I would have known, I would have helped.", "answers": ["If I had known, I would have helped."], "explanation": "..."}]}
```

6) open — открытый ответ (перевод с русского, ответы своими словами, «что означают эти числа»). Проверяется по "answers" (если совпало — засчитывается автоматически), иначе отправляется на проверку ИИ:
```json
{"id": "E", "type": "open", "title": "...", "instruction": "Translate into English using the vocabulary from Section 1.",
 "items": [{"text": "Компания была вынуждена приостановить все операции.", "answers": ["The company was forced to suspend all operations.", "The company had to suspend all operations."], "model_answer": "The company was forced to suspend all operations."}]}
```

7) writing — эссе, проверяется ИИ:
```json
{"id": "W", "type": "writing", "title": "Writing", "instruction": "Opinion essay: ... Give two arguments.", "min_words": 150, "max_words": 180, "required_words": ["comply with", "suspend"]}
```

8) discussion — вопросы для обсуждения/говорения (не проверяются):
```json
{"id": "S", "type": "discussion", "title": "Speaking", "instruction": "Discuss in pairs.", "items": [{"text": "Do you think ...?"}]}
```

### Блок "review" (только для раундов повторения)
```json
"review": {
  "summary": "Общий вывод по ошибкам: что проседает (по-русски).",
  "items": [
    {"mistake": "If I would have known", "correct": "If I had known", "rule": "Third conditional", "explanation": "Почему так, по-русски, коротко."}
  ]
}
```
