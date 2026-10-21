<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { callClientEvent } from '@/core/client-events/client-event'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'

const props = defineProps<{
  payload?: InterfacePayloadMap['drivingSchool']
}>()

const pending = ref(false)
const studyIndex = ref(0)
const selectedStudyAnswer = ref<number | null>(null)
let pendingTimer: ReturnType<typeof setTimeout> | null = null

const phase = computed(() => props.payload?.phase || 'theoryIntro')
const question = computed(() => props.payload?.question ?? null)
const studyQuestions = computed(() => props.payload?.studyQuestions || [])
const studyQuestion = computed(() => studyQuestions.value[studyIndex.value] ?? null)
const studyProgress = computed(() => ({
  current: studyQuestions.value.length ? studyIndex.value + 1 : 0,
  total: studyQuestions.value.length,
  percent: studyQuestions.value.length ? (studyIndex.value + 1) / studyQuestions.value.length * 100 : 0,
}))
const progress = computed(() => {
  const current = Number(question.value?.index || 0) + 1
  const total = Number(question.value?.total || props.payload?.total || 10)
  return { current, total, percent: Math.max(0, Math.min(100, current / total * 100)) }
})

watch(() => props.payload, () => {
  pending.value = false
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
}, { deep: true })

watch(() => props.payload?.token, () => {
  studyIndex.value = 0
  selectedStudyAnswer.value = null
})

function beginPending() {
  pending.value = true
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    pending.value = false
    pendingTimer = null
  }, 2500)
}

function beginTheory() {
  if (pending.value) return
  beginPending()
  callClientEvent('drivingSchool:beginTheory', JSON.stringify({
    token: props.payload?.token,
  }))
}

function answer(index: number) {
  if (pending.value || phase.value !== 'questions' || !question.value) return
  beginPending()
  callClientEvent('drivingSchool:answer', JSON.stringify({
    token: props.payload?.token,
    index: question.value.index,
    answer: index,
  }))
}

function chooseStudyAnswer(index: number) {
  if (!studyQuestion.value || selectedStudyAnswer.value !== null) return
  selectedStudyAnswer.value = index
}

function moveStudy(offset: number) {
  const next = Math.max(0, Math.min(studyQuestions.value.length - 1, studyIndex.value + offset))
  if (next === studyIndex.value) return
  studyIndex.value = next
  selectedStudyAnswer.value = null
}

function studyAnswerClass(index: number) {
  if (!studyQuestion.value || selectedStudyAnswer.value === null) return {}
  return {
    'answer--correct': index === studyQuestion.value.correct,
    'answer--wrong': index === selectedStudyAnswer.value && index !== studyQuestion.value.correct,
  }
}

function close() {
  if (pending.value) return
  beginPending()
  callClientEvent('drivingSchool:close', JSON.stringify({
    token: props.payload?.token,
  }))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (pendingTimer) clearTimeout(pendingTimer)
})
</script>

<template>
  <main class="school-shell">
    <section class="school-card">
      <header class="school-header">
        <div class="school-brand">
          <div>
            <p>Автошкола NoName</p>
            <h1>{{ phase === 'study' ? 'Изучение теории' : 'Экзамен категории B' }}</h1>
          </div>
        </div>
        <button class="school-close" type="button" :disabled="pending" aria-label="Закрыть" @click="close">
          <span>ESC</span>
          Закрыть
        </button>
      </header>

      <div v-if="phase === 'study' && studyQuestion" class="school-content school-study">
        <div class="question-progress">
          <div>
            <span>Учебный вопрос {{ studyProgress.current }} из {{ studyProgress.total }}</span>
            <b>Бесплатная подготовка</b>
          </div>
          <div class="question-progress__track">
            <i :style="{ width: `${studyProgress.percent}%` }" />
          </div>
        </div>

        <section class="question-card question-card--study">
          <span class="eyebrow">Выберите ответ — после этого появится разбор</span>
          <h2>{{ studyQuestion.text }}</h2>
          <div class="answer-grid">
            <button
              v-for="(item, index) in studyQuestion.answers"
              :key="item"
              type="button"
              :class="studyAnswerClass(index)"
              @click="chooseStudyAnswer(index)"
            >
              <span>{{ String.fromCharCode(65 + index) }}</span>
              <b>{{ item }}</b>
            </button>
          </div>

          <div v-if="selectedStudyAnswer !== null" class="study-explanation">
            <strong>{{ selectedStudyAnswer === studyQuestion.correct ? 'Верно' : 'Неверно' }}</strong>
            <p>{{ studyQuestion.explanation }}</p>
          </div>
        </section>

        <footer class="study-navigation">
          <button type="button" :disabled="studyIndex === 0" @click="moveStudy(-1)">Назад</button>
          <span>{{ studyProgress.current }} / {{ studyProgress.total }}</span>
          <button
            type="button"
            :disabled="studyIndex >= studyQuestions.length - 1"
            @click="moveStudy(1)"
          >
            Следующий вопрос
          </button>
        </footer>
      </div>

      <div v-else-if="phase === 'theoryIntro'" class="school-content school-intro">
        <div class="school-intro__lead">
          <span class="eyebrow">Теория перед практикой</span>
          <h2>Правила безопасного вождения</h2>
          <p>Прочитайте памятку и ответьте правильно на все 10 вопросов по ПДД РФ. После успешной теории вы сразу окажетесь за рулём учебной машины.</p>
        </div>

        <ol class="theory-list">
          <li v-for="(item, index) in props.payload?.theory || []" :key="item">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <p>{{ item }}</p>
          </li>
        </ol>

        <footer class="school-footer">
          <div>
            <span>Стоимость попытки</span>
            <strong>${{ props.payload?.price || 100 }}</strong>
          </div>
          <p>Любое повреждение машины или пропуск точки завершает экзамен.</p>
          <button type="button" :disabled="pending" @click="beginTheory">
            {{ pending ? 'Загрузка…' : 'Начать тест' }}
          </button>
        </footer>
      </div>

      <div v-else-if="phase === 'questions' && question" class="school-content school-question">
        <div class="question-progress">
          <div>
            <span>Вопрос {{ progress.current }} из {{ progress.total }}</span>
            <b>Нужно {{ progress.total }}/{{ progress.total }}</b>
          </div>
          <div class="question-progress__track">
            <i :style="{ width: `${progress.percent}%` }" />
          </div>
        </div>

        <section class="question-card">
          <span class="eyebrow">Выберите один ответ</span>
          <h2>{{ question.text }}</h2>
          <div class="answer-grid">
            <button
              v-for="(item, index) in question.answers"
              :key="item"
              type="button"
              :disabled="pending"
              @click="answer(index)"
            >
              <span>{{ String.fromCharCode(65 + index) }}</span>
              <b>{{ item }}</b>
            </button>
          </div>
        </section>
      </div>

      <div v-else-if="phase === 'theoryFeedback'" class="school-content school-status">
        <span class="school-status__icon" :class="{ 'school-status__icon--error': !props.payload?.feedbackCorrect }">
          {{ props.payload?.feedbackCorrect ? '✓' : '×' }}
        </span>
        <span class="eyebrow">Ответ принят</span>
        <h2>{{ props.payload?.feedback || 'Проверяем ответ…' }}</h2>
        <p>Переходим к следующему вопросу.</p>
      </div>

      <div v-else class="school-content school-status">
        <span class="school-status__icon" :class="{ 'school-status__icon--error': !props.payload?.passed }">
          {{ props.payload?.passed ? '✓' : '×' }}
        </span>
        <span class="eyebrow">Результат теории</span>
        <h2>{{ props.payload?.passed ? 'Теория сдана' : 'Теория не сдана' }}</h2>
        <p>{{ props.payload?.resultMessage }}</p>
        <div class="score-pill">{{ props.payload?.score || 0 }} / {{ props.payload?.total || 10 }}</div>
      </div>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.school-shell {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 4vh;
  color: #f7f9ff;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  background: transparent;
}

.school-card {
  position: relative;
  z-index: 1;
  width: min(112vh, 94vw);
  min-height: min(76vh, 88vh);
  overflow: hidden;
  border: 1px solid rgb(185 124 255 / 30%);
  border-radius: 2.2vh;
  background: rgb(24 13 38 / 68%);
  box-shadow: none;
}

.school-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 10.5vh;
  padding: 2vh 2.6vh;
  border-bottom: 1px solid rgb(184 115 255 / 20%);
}

.school-brand { display: flex; align-items: center; gap: 1.5vh; }

.school-brand p,
.eyebrow,
.school-footer span,
.question-progress span {
  color: #c999ff;
  font-size: 1.15vh;
  font-weight: 800;
  letter-spacing: 0.12vh;
  text-transform: uppercase;
}

.school-brand h1 { margin-top: 0.35vh; font-size: 2.45vh; }
.school-close {
  display: flex;
  align-items: center;
  gap: 0.8vh;
  padding: 0.9vh 1.2vh;
  border: 1px solid rgb(185 124 255 / 24%);
  border-radius: 0.8vh;
  color: rgb(255 255 255 / 70%);
  background: rgb(132 63 203 / 14%);
  cursor: pointer;
}
.school-close span { padding: 0.4vh 0.65vh; border-radius: 0.4vh; color: #fff; background: rgb(255 255 255 / 9%); font-size: 1vh; }

.school-content { min-height: 65vh; padding: 4vh; }
.school-intro { display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 3vh 5vh; align-content: start; }
.school-intro__lead { padding-top: 1.4vh; }
.school-intro__lead h2,
.question-card h2,
.school-status h2 { margin-top: 1.2vh; font-size: clamp(2.9vh, 3.7vh, 4.4vh); line-height: 1.06; }
.school-intro__lead > p,
.school-status p { margin-top: 1.6vh; color: rgb(255 255 255 / 58%); font-size: 1.55vh; line-height: 1.55; }

.theory-list { display: grid; gap: 1vh; list-style: none; }
.theory-list li {
  display: grid;
  grid-template-columns: 4.6vh 1fr;
  gap: 1.3vh;
  align-items: center;
  min-height: 7.2vh;
  padding: 1.2vh 1.5vh;
  border: 1px solid rgb(185 124 255 / 18%);
  border-radius: 1vh;
  background: rgb(122 54 190 / 10%);
}
.theory-list span { color: #c999ff; font-size: 1.35vh; font-weight: 900; }
.theory-list p { color: rgb(255 255 255 / 82%); font-size: 1.45vh; line-height: 1.35; }

.school-footer {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 2.5vh;
  align-items: center;
  margin-top: 0.5vh;
  padding: 1.6vh;
  border-radius: 1.2vh;
  background: rgb(151 75 224 / 12%);
}
.school-footer strong { display: block; margin-top: 0.25vh; font-size: 2.5vh; }
.school-footer p { color: rgb(255 255 255 / 55%); font-size: 1.28vh; }
.school-footer button,
.answer-grid button {
  border: 0;
  color: #ffffff;
  background: #8f48d6;
  font-weight: 900;
  cursor: pointer;
  transition: transform 150ms ease, filter 150ms ease;
}
.school-footer button { padding: 1.45vh 2.2vh; border-radius: 0.9vh; font-size: 1.4vh; }
.school-footer button:hover,
.answer-grid button:hover { filter: brightness(1.08); transform: translateY(-0.15vh); }
button:disabled { opacity: 0.55; cursor: wait; }

.school-question { display: grid; grid-template-rows: auto 1fr; gap: 3vh; }
.school-study { display: grid; grid-template-rows: auto 1fr auto; gap: 2vh; }
.question-progress > div:first-child { display: flex; justify-content: space-between; }
.question-progress b { color: rgb(255 255 255 / 45%); font-size: 1.15vh; }
.question-progress__track { height: 0.55vh; overflow: hidden; margin-top: 1.1vh; border-radius: 1vh; background: rgb(255 255 255 / 7%); }
.question-progress__track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #8540cc, #c58cff); transition: width 300ms ease; }
.question-card { display: grid; align-content: center; max-width: 88vh; width: 100%; margin: 0 auto 4vh; text-align: center; }
.answer-grid { display: grid; gap: 1.2vh; margin-top: 4vh; text-align: left; }
.answer-grid button {
  display: grid;
  grid-template-columns: 4.8vh 1fr;
  align-items: center;
  min-height: 7.4vh;
  padding: 1.1vh 1.5vh;
  border: 1px solid rgb(185 124 255 / 20%);
  border-radius: 1vh;
  color: #fff;
  background: rgb(122 54 190 / 12%);
}
.answer-grid button > span { display: grid; width: 3.5vh; height: 3.5vh; place-items: center; border-radius: 0.7vh; color: #d7b2ff; background: rgb(158 83 226 / 18%); }
.answer-grid b { font-size: 1.55vh; }
.answer-grid button.answer--correct {
  border-color: rgb(91 222 142 / 72%);
  background: rgb(42 139 82 / 34%);
}
.answer-grid button.answer--correct > span { color: #dffff0; background: rgb(65 201 119 / 35%); }
.answer-grid button.answer--wrong {
  border-color: rgb(255 104 126 / 72%);
  background: rgb(160 48 66 / 30%);
}
.answer-grid button.answer--wrong > span { color: #ffe1e6; background: rgb(224 73 96 / 30%); }

.question-card--study { align-content: start; margin-bottom: 0; padding-top: 1.5vh; }
.question-card--study h2 { font-size: clamp(2.4vh, 3.1vh, 3.7vh); }
.question-card--study .answer-grid { margin-top: 2.4vh; }
.study-explanation {
  margin-top: 2vh;
  padding: 1.6vh 1.8vh;
  border: 1px solid rgb(185 124 255 / 22%);
  border-radius: 1vh;
  background: rgb(143 72 214 / 13%);
  text-align: left;
}
.study-explanation strong { color: #dcbaff; font-size: 1.55vh; }
.study-explanation p { margin-top: 0.6vh; color: rgb(255 255 255 / 72%); font-size: 1.4vh; line-height: 1.45; }
.study-navigation { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 2vh; }
.study-navigation span { color: rgb(255 255 255 / 58%); font-size: 1.3vh; font-weight: 800; }
.study-navigation button {
  min-height: 4.6vh;
  padding: 0.8vh 1.5vh;
  border: 1px solid rgb(185 124 255 / 24%);
  border-radius: 0.8vh;
  color: #fff;
  background: rgb(143 72 214 / 22%);
  font-size: 1.3vh;
  font-weight: 800;
  cursor: pointer;
}
.study-navigation button:first-child { justify-self: start; }
.study-navigation button:last-child { justify-self: end; }

.school-status { display: grid; place-items: center; align-content: center; text-align: center; }
.school-status__icon { display: grid; width: 9vh; height: 9vh; place-items: center; margin-bottom: 2.4vh; border-radius: 50%; color: #fff; background: #8f48d6; box-shadow: none; font-size: 5vh; font-weight: 900; }
.school-status__icon--error { color: #ffffff; background: #7133a8; box-shadow: none; }
.score-pill { margin-top: 2.5vh; padding: 1vh 2vh; border: 1px solid rgb(255 255 255 / 9%); border-radius: 5vh; color: #fff; background: rgb(255 255 255 / 4%); font-size: 1.5vh; font-weight: 900; }

@media (max-width: 900px) {
  .school-intro { grid-template-columns: 1fr; }
  .school-footer { grid-template-columns: 1fr; }
}
</style>
