<template>
  <section class="skill-tree">
    <h1 class="f2-menu__title">Дерево навыков</h1>

    <div class="skill-tree__tabs" aria-label="Тип дерева навыков">
      <button class="skill-tree__tab skill-tree__tab--active" type="button">Персонаж</button>
      <button class="skill-tree__tab" type="button">Фракция</button>
    </div>

    <Transition name="skill-tree-hint">
      <div v-if="hoveredSkill" class="skill-tree__hover-hint">
        <span>{{ hoveredSkill.hasSkill ? 'Открыто' : 'Не открыто' }}</span>
        <strong>{{ hoveredSkill.name }}</strong>
      </div>
    </Transition>

    <svg class="skill-tree__map" viewBox="0 0 910 714" role="img" aria-label="Дерево навыков персонажа">
      <g
        v-for="(category, categoryIndex) in skillCategories"
        :key="category.id"
        class="skill-tree__branch"
        :class="`skill-tree__branch--${category.id}`"
        :style="{ '--branch-order': categoryIndex }"
        :transform="category.transform"
      >
        <g class="skill-tree__branch-growth" :class="{ 'skill-tree__branch-growth--unlocking': unlockingBranchId === category.id }">
          <g class="skill-tree__branch-lines" aria-hidden="true">
            <line y1="-0.5" x2="59.3335" y2="-0.5" transform="matrix(0 -1 -1 0 51.0938 432.409)" />
            <line y1="-0.5" x2="13.1852" y2="-0.5" transform="matrix(0 -1 -1 0 19.7793 162.112)" />
            <line y1="-0.5" x2="13.1852" y2="-0.5" transform="matrix(0 -1 -1 0 19.7793 218.149)" />
            <path d="M50.6354 295.612C51.0229 278.388 26.2861 265.227 20.5137 261.825" />
            <path d="M20.5112 261.825C19.7497 261.376 19.3184 260.273 19.3184 260.177" />
            <path d="M51.0931 295.612C50.7056 278.388 75.4424 265.227 81.2148 261.825" />
            <path d="M50.6354 70.6389C51.0229 87.8629 26.2861 101.024 20.5137 104.426" />
            <path d="M20.5112 104.426C19.7497 104.875 19.3184 105.978 19.3184 106.074" />
            <path d="M51.0931 70.6389C50.7056 87.8629 75.4424 101.024 81.2148 104.426" />
            <line y1="-0.5" x2="13.1852" y2="-0.5" transform="matrix(0 -1 -1 0 82.4082 218.149)" />
            <line y1="-0.5" x2="13.1852" y2="-0.5" transform="matrix(0 -1 -1 0 82.4082 162.112)" />
            <path d="M81.2154 261.825C81.9768 261.376 82.4082 260.273 82.4082 260.177" />
            <path d="M81.2154 104.426C81.9768 104.875 82.4082 105.978 82.4082 106.074" />
          </g>

          <g
            v-for="skill in category.skills"
            :key="skill.id"
            class="skill-tree__skill"
            :class="{
              'skill-tree__skill--active': skill.hasSkill,
              'skill-tree__skill--selected': skillAction?.id === skill.id,
              'skill-tree__skill--unlocked-now': unlockedPulseSkillId === skill.id,
              'skill-tree__skill--icon': Boolean(skill.icon),
            }"
            :data-category="category.id"
            :data-skill-id="skill.id"
            :data-index="skill.index"
            :style="{ '--skill-index': skill.index }"
            role="button"
            tabindex="0"
            @click="selectSkill(skill)"
            @keydown.enter.prevent="selectSkill(skill)"
            @keydown.space.prevent="selectSkill(skill)"
            @mouseenter="hoveredSkill = skill"
            @mouseleave="hoveredSkill = null"
            @focus="hoveredSkill = skill"
            @blur="hoveredSkill = null"
          >
            <rect
              :x="skill.x - skill.radius"
              :y="skill.y - skill.radius"
              :width="skill.radius * 2"
              :height="skill.radius * 2"
              :rx="skill.radius"
            />

            <SkillTreeIcon
              v-if="skill.icon"
              :icon="skill.icon"
              :x="skill.x"
              :y="skill.y"
              :size="skill.radius * 0.92"
            />
          </g>
        </g>
      </g>

      <g class="skill-tree__center">
        <rect x="427.5" y="358.5" width="55" height="55" rx="27.5" />
        <SkillTreeIcon icon="masks" :x="455" :y="386" :size="23" />
      </g>
    </svg>

    <Transition name="skill-tree-details">
      <aside v-if="hoveredSkill" class="skill-tree__details skill-tree__details--preview">
        <header>
          <div>
            <span>{{ hoveredSkill.hasSkill ? 'Навык открыт' : 'Навык закрыт' }}</span>
            <h2>{{ hoveredSkill.name }}</h2>
          </div>
        </header>

        <p>{{ hoveredSkill.description }}</p>

        <div class="skill-tree__details-state" :class="{ 'skill-tree__details-state--active': hoveredSkill.hasSkill }">
          {{ hoveredSkill.hasSkill ? 'Бонус уже применяется к персонажу' : 'Клик по клетке откроет навык' }}
        </div>

        <ul>
          <li v-for="benefit in hoveredSkill.benefits" :key="benefit">{{ benefit }}</li>
        </ul>
      </aside>
    </Transition>

    <Transition name="skill-tree-details">
      <aside v-if="skillAction" class="skill-tree__details skill-tree__details--action">
        <header>
          <div>
            <span>{{ skillAction.hasSkill ? 'Уже открыто' : 'Открытие навыка' }}</span>
            <h2>{{ skillAction.name }}</h2>
          </div>
          <button type="button" aria-label="Закрыть" @click="skillAction = null"></button>
        </header>

        <p>
          {{ skillAction.hasSkill
            ? 'Этот навык уже открыт и его бонусы активны.'
            : 'Здесь будет подтверждение покупки/открытия навыка, когда подключим реальные данные прогресса.' }}
        </p>

        <button
          class="skill-tree__unlock-button"
          type="button"
          :disabled="skillAction.hasSkill"
          @click="unlockSkill(skillAction)"
        >
          {{ skillAction.hasSkill ? 'Навык открыт' : 'Открыть навык' }}
        </button>
      </aside>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'

type SkillCategoryId =
  | 'skills'
  | 'social'
  | 'craft'
  | 'driving'
  | 'shooting'
  | 'stealth'
  | 'survival'
  | 'trade'

type SkillIcon = 'feather' | 'masks'

type Skill = {
  benefits: string[]
  description: string
  hasSkill: boolean
  icon?: SkillIcon
  id: string
  index: number
  name: string
}

type RenderedSkill = Skill & {
  radius: number
  x: number
  y: number
}

type SkillCategory = {
  angle: number
  id: SkillCategoryId
  skills: Skill[]
}

type RenderedSkillCategory = SkillCategory & {
  skills: RenderedSkill[]
  transform: string
}

type BranchSkillSlot = {
  radius: number
  x: number
  y: number
}

const CENTER_X = 455
const CENTER_Y = 386
const BRANCH_SCALE = 0.72
const BRANCH_ANCHOR_X = 51.9188
const BRANCH_ANCHOR_Y = 334.343
const BRANCH_OFFSET = 70.6

const branchSkillSlots: BranchSkillSlot[] = [
  { x: 51.9188, y: 32.7313, radius: 38.3816 },
  { x: 21.0775, y: 127.15, radius: 21.076 },
  { x: 82.058, y: 127.15, radius: 21.076 },
  { x: 21.0775, y: 183.187, radius: 21.076 },
  { x: 82.058, y: 183.187, radius: 21.076 },
  { x: 21.0775, y: 239.225, radius: 21.076 },
  { x: 82.058, y: 239.225, radius: 21.076 },
  { x: 51.9188, y: 334.343, radius: 38.3816 },
]

const skillCategoryNames: Record<SkillCategoryId, string> = {
  craft: 'Ремесло',
  driving: 'Вождение',
  shooting: 'Стрельба',
  skills: 'Развитие',
  social: 'Социальность',
  stealth: 'Скрытность',
  survival: 'Выживание',
  trade: 'Торговля',
}

const skillSlotNames = [
  'Мастер ветки',
  'Базовая практика',
  'Точный расчет',
  'Уверенное действие',
  'Быстрая реакция',
  'Продвинутая техника',
  'Стабильный результат',
  'Особый талант',
]

const skillCategoriesSource: SkillCategory[] = [
  { id: 'skills', angle: 0, skills: createSkills('skills') },
  { id: 'trade', angle: 45, skills: createSkills('trade') },
  { id: 'social', angle: 90, skills: createSkills('social') },
  { id: 'driving', angle: 135, skills: createSkills('driving') },
  { id: 'survival', angle: 180, skills: createSkills('survival') },
  { id: 'stealth', angle: 225, skills: createSkills('stealth', { hasSkillIndex: 7, iconIndex: 7, icon: 'feather' }) },
  { id: 'craft', angle: 270, skills: createSkills('craft') },
  { id: 'shooting', angle: 315, skills: createSkills('shooting') },
]

const skillCategories = computed<RenderedSkillCategory[]>(() =>
  skillCategoriesSource.map((category) => ({
    ...category,
    skills: category.skills.map((skill, index) => ({
      ...skill,
      hasSkill: skill.hasSkill || unlockedSkillIds.value.includes(skill.id),
      ...branchSkillSlots[index],
    })),
    transform: getBranchTransform(category.angle),
  })),
)

const hoveredSkill = ref<RenderedSkill | null>(null)
const skillAction = ref<RenderedSkill | null>(null)
const unlockedSkillIds = ref<string[]>([])
const unlockedPulseSkillId = ref<string | null>(null)
const unlockingBranchId = ref<SkillCategoryId | null>(null)

const SkillTreeIcon = defineComponent({
  name: 'SkillTreeIcon',
  props: {
    icon: {
      required: true,
      type: String,
    },
    size: {
      required: true,
      type: Number,
    },
    x: {
      required: true,
      type: Number,
    },
    y: {
      required: true,
      type: Number,
    },
  },
  setup(props) {
    return () => {
      const transform = `translate(${props.x - props.size / 2} ${props.y - props.size / 2})`

      if (props.icon === 'feather') {
        return h('svg', {
          class: 'skill-tree__skill-icon skill-tree__skill-icon--feather',
          height: props.size,
          transform,
          viewBox: '0 0 36 36',
          width: props.size,
        }, [
          h('path', { d: 'M30.8 4.7C20.1 5.5 10.1 12.6 6.5 25.5c7.9-1 14.8-5 20.7-12.2-5.7 3.2-10.7 6.5-15.1 10.1 3.4-7.1 9.7-13.5 18.7-18.7Z' }),
          h('path', {
            d: 'M5 31.2c4.1-5.5 9.1-10.5 15-14.9',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-linecap': 'round',
            'stroke-width': '2.2',
          }),
        ])
      }

      return h('svg', {
        class: 'skill-tree__skill-icon skill-tree__skill-icon--masks',
        height: props.size,
        transform,
        viewBox: '0 0 36 36',
        width: props.size,
      }, [
        h('path', { d: 'M2.5 8.5c3.7-1.4 8.9-1 13.6 1.7.9 4.7.2 9.9-2.8 13.3-2.4 2.7-6.3 2.6-8.5-.3C2.2 19.7 1.2 13.9 2.5 8.5Z' }),
        h('path', { d: 'M33.5 8.5c-3.7-1.4-8.9-1-13.6 1.7-.9 4.7-.2 9.9 2.8 13.3 2.4 2.7 6.3 2.6 8.5-.3 2.6-3.5 3.6-9.3 2.3-14.7Z' }),
        h('path', { d: 'M11 26.5c1.2 2.4 3.4 4.1 7 4.1s5.8-1.7 7-4.1c-2.2.9-4.4.7-7-.8-2.6 1.5-4.8 1.7-7 .8Z' }),
        h('path', { class: 'skill-tree__skill-icon-cutout', d: 'M7.2 14.9c1.7-.9 4.3-.7 5.7.7-1.2 1.5-4.5 1.2-5.7-.7Z' }),
        h('path', { class: 'skill-tree__skill-icon-cutout', d: 'M23.1 15.6c1.4-1.4 4-1.6 5.7-.7-1.2 1.9-4.5 2.2-5.7.7Z' }),
      ])
    }
  },
})

function createSkills(
  category: SkillCategoryId,
  options: { hasSkillIndex?: number, icon?: SkillIcon, iconIndex?: number } = {},
) {
  return branchSkillSlots.map((_, index) => ({
    benefits: createSkillBenefits(category, index),
    description: createSkillDescription(category, index),
    hasSkill: options.hasSkillIndex === index,
    icon: options.iconIndex === index ? options.icon : undefined,
    id: `${category}-${index + 1}`,
    index,
    name: `${skillCategoryNames[category]}: ${skillSlotNames[index]}`,
  }))
}

function createSkillDescription(category: SkillCategoryId, index: number) {
  const categoryName = skillCategoryNames[category].toLowerCase()

  if (category === 'stealth' && index === 7) {
    return 'Особый навык скрытности. Персонаж быстрее уходит из заметной позиции и аккуратнее действует рядом с другими игроками.'
  }

  return `Навык ветки "${categoryName}" усиливает персонажа в связанных действиях и открывает более стабильное выполнение задач этого направления.`
}

function createSkillBenefits(category: SkillCategoryId, index: number) {
  if (category === 'stealth' && index === 7) {
    return [
      'Снижает шанс сорвать скрытное действие',
      'Ускоряет восстановление после резких маневров',
      'Открывает доступ к продвинутым приемам ветки',
    ]
  }

  return [
    `Улучшает эффективность ветки на ${Math.min(5 + index * 2, 18)}%`,
    'Повышает стабильность результата при повторных действиях',
    index >= 6 ? 'Открывает следующий крупный узел развития' : 'Приближает к следующему крупному узлу',
  ]
}

function openSkillAction(skill: RenderedSkill) {
  skillAction.value = skill
}

function selectSkill(skill: RenderedSkill) {
  openSkillAction(skill)
}

function unlockSkill(skill: RenderedSkill) {
  if (skill.hasSkill || unlockedSkillIds.value.includes(skill.id)) {
    return
  }

  unlockedSkillIds.value = [...unlockedSkillIds.value, skill.id]
  unlockedPulseSkillId.value = skill.id
  unlockingBranchId.value = getSkillCategoryId(skill.id)
  skillAction.value = {
    ...skill,
    hasSkill: true,
  }

  if (hoveredSkill.value?.id === skill.id) {
    hoveredSkill.value = {
      ...hoveredSkill.value,
      hasSkill: true,
    }
  }

  window.setTimeout(() => {
    if (unlockedPulseSkillId.value === skill.id) {
      unlockedPulseSkillId.value = null
    }
  }, 820)

  window.setTimeout(() => {
    if (unlockingBranchId.value === getSkillCategoryId(skill.id)) {
      unlockingBranchId.value = null
    }
  }, 760)
}

function getSkillCategoryId(skillId: string) {
  return skillId.replace(/-\d+$/, '') as SkillCategoryId
}

function getBranchTransform(angle: number) {
  const radians = (angle - 90) * Math.PI / 180
  const anchorX = CENTER_X + Math.cos(radians) * BRANCH_OFFSET
  const anchorY = CENTER_Y + Math.sin(radians) * BRANCH_OFFSET

  return [
    `translate(${anchorX} ${anchorY})`,
    `rotate(${angle})`,
    `scale(${BRANCH_SCALE})`,
    `translate(${-BRANCH_ANCHOR_X} ${-BRANCH_ANCHOR_Y})`,
  ].join(' ')
}
</script>

<style scoped>
.skill-tree {
  position: relative;
  min-height: calc(100vh - 2.1vh);
  isolation: isolate;
  overflow: hidden;
}

.skill-tree__tabs {
  position: relative;
  z-index: 2;
  width: fit-content;
  display: grid;
  grid-template-columns: repeat(2, 11.5vh);
  gap: 1.2vh;
  margin: 3.6vh auto 0;
}

.skill-tree__tab {
  min-height: 2.8vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0.55vh;
  background: rgb(0 0 0 / 78%);
  color: rgb(255 255 255 / 72%);
  cursor: pointer;
  font: inherit;
  font-size: 1.5vh;
  font-weight: 600;
  line-height: 1;
}

.skill-tree__tab--active {
  color: #ffffff;
}

.skill-tree__hover-hint {
  position: absolute;
  z-index: 4;
  top: 9.8vh;
  left: 50%;
  min-width: 20vh;
  display: grid;
  gap: 0.25vh;
  padding: 0.9vh 1.25vh;
  border: 1px solid rgb(172 46 205 / 38%);
  border-radius: 0.9vh;
  background: rgb(8 8 8 / 98%);
  box-shadow: 0 1.2vh 2.6vh rgb(0 0 0 / 42%);
  pointer-events: none;
  text-align: center;
  transform: translateX(-50%);
}

.skill-tree__hover-hint span {
  color: #ac2ecd;
  font-size: 0.95vh;
  font-weight: 600;
  text-transform: uppercase;
}

.skill-tree__hover-hint strong {
  color: #ffffff;
  font-size: 1.25vh;
  line-height: 1.15;
}

.skill-tree__map {
  width: min(124vh, calc(100vw - 42vh));
  height: auto;
  aspect-ratio: 910 / 714;
  display: block;
  margin: -11.7vh auto 0;
  overflow: visible;
}

.skill-tree__branch-lines line,
.skill-tree__branch-lines path {
  fill: none;
  stroke: #727272;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 900;
  stroke-dashoffset: 900;
  animation: skillTreeThreadGrow 920ms cubic-bezier(0.22, 0.9, 0.25, 1) forwards;
  animation-delay: calc(120ms + var(--branch-order) * 90ms);
}

.skill-tree__branch-lines line:nth-child(2),
.skill-tree__branch-lines path:nth-child(4),
.skill-tree__branch-lines path:nth-child(7) {
  animation-delay: calc(260ms + var(--branch-order) * 90ms);
}

.skill-tree__branch-lines line:nth-child(3),
.skill-tree__branch-lines path:nth-child(6),
.skill-tree__branch-lines path:nth-child(9) {
  animation-delay: calc(360ms + var(--branch-order) * 90ms);
}

.skill-tree__branch-lines line:nth-child(10),
.skill-tree__branch-lines line:nth-child(11),
.skill-tree__branch-lines path:nth-child(12),
.skill-tree__branch-lines path:nth-child(13) {
  animation-delay: calc(460ms + var(--branch-order) * 90ms);
}

.skill-tree__branch-lines line:nth-child(1) {
  stroke: rgb(172 46 205 / 72%);
}

.skill-tree__branch-growth {
  transform-box: fill-box;
  transform-origin: center;
}

.skill-tree__branch-growth--unlocking {
  animation: skillTreeBranchUnlock 720ms cubic-bezier(0.18, 0.9, 0.25, 1) both;
}

.skill-tree__branch-growth--unlocking .skill-tree__branch-lines line,
.skill-tree__branch-growth--unlocking .skill-tree__branch-lines path {
  stroke: rgb(172 46 205 / 82%);
}

.skill-tree__skill rect,
.skill-tree__center rect {
  opacity: 0.7;
  fill: #0b0b0b;
  stroke: #727272;
  stroke-width: 0.7;
  vector-effect: non-scaling-stroke;
}

.skill-tree__skill {
  opacity: 0;
  cursor: pointer;
  outline: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: skillTreeSkillBloom 420ms cubic-bezier(0.2, 0.95, 0.25, 1.2) forwards;
  animation-delay: calc(450ms + var(--branch-order) * 90ms + var(--skill-index) * 75ms);
}

.skill-tree__skill:focus,
.skill-tree__skill:focus-visible {
  outline: none;
}

.skill-tree__skill:hover {
  animation:
    skillTreeSkillBloom 420ms cubic-bezier(0.2, 0.95, 0.25, 1.2) forwards,
    skillTreeCellTremble 520ms ease-in-out infinite;
  animation-delay:
    calc(450ms + var(--branch-order) * 90ms + var(--skill-index) * 75ms),
    0ms;
}

.skill-tree__skill:hover rect {
  opacity: 0.96;
  fill: rgb(18 18 18 / 96%);
  stroke: rgb(255 255 255 / 78%);
  stroke-width: 1.15;
}

.skill-tree__skill--active:hover rect {
  fill: rgb(103 21 122 / 96%);
  stroke: #d454f4;
}

.skill-tree__skill:hover .skill-tree__skill-icon {
  color: #ffffff;
}

.skill-tree__skill--active rect,
.skill-tree__center rect {
  opacity: 0.86;
  fill: #050505;
}

.skill-tree__skill--active rect {
  fill: rgb(82 18 95 / 92%);
  stroke: #ac2ecd;
  stroke-width: 1.15;
}

.skill-tree__skill--active .skill-tree__skill-icon {
  color: #ffffff;
}

.skill-tree__skill--selected rect,
.skill-tree__skill:focus-visible rect {
  opacity: 0.98;
  fill: rgb(84 68 10 / 92%);
  stroke: #f3d13b;
  stroke-width: 1.35;
}

.skill-tree__skill--active.skill-tree__skill--selected rect,
.skill-tree__skill--active:focus-visible rect {
  fill: rgb(96 58 22 / 96%);
  stroke: #f3d13b;
}

.skill-tree__skill--unlocked-now {
  animation:
    skillTreeSkillBloom 420ms cubic-bezier(0.2, 0.95, 0.25, 1.2) forwards,
    skillTreeUnlockPulse 820ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 0ms, 0ms;
}

.skill-tree__skill--unlocked-now rect {
  fill: rgb(124 24 150 / 96%);
  stroke: #e27cff;
  stroke-width: 1.45;
}

.skill-tree__center {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: skillTreeCenterBloom 520ms cubic-bezier(0.16, 1, 0.3, 1.1) forwards;
}

.skill-tree__center rect {
  stroke: #ac2ecd;
  stroke-width: 1.05;
}

.skill-tree__skill-icon {
  color: #ffffff;
  fill: currentColor;
  pointer-events: none;
  opacity: 0;
  animation: skillTreeIconReveal 260ms ease forwards;
  animation-delay: calc(650ms + var(--branch-order) * 90ms + var(--skill-index) * 75ms);
}

.skill-tree__skill-icon--feather {
  fill: none;
  stroke: currentColor;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.skill-tree__skill-icon-cutout {
  fill: #0b0b0b;
}

.skill-tree__center .skill-tree__skill-icon {
  opacity: 1;
  animation: none;
}

.skill-tree__details {
  position: absolute;
  z-index: 5;
  right: 4vh;
  bottom: 5vh;
  width: min(34vh, calc(100% - 8vh));
  display: grid;
  gap: 1.15vh;
  padding: 1.35vh;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.15vh;
  background: rgb(7 7 7 / 99%);
  box-shadow: 0 1.6vh 3.6vh rgb(0 0 0 / 50%);
}

.skill-tree__details--preview {
  right: 4vh;
  bottom: 5vh;
  pointer-events: none;
}

.skill-tree__details--action {
  left: 4vh;
  right: auto;
  bottom: 5vh;
}

.skill-tree__details header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.2vh;
}

.skill-tree__details header span {
  color: #ac2ecd;
  font-size: 0.95vh;
  font-weight: 600;
  text-transform: uppercase;
}

.skill-tree__details h2,
.skill-tree__details p {
  margin: 0;
}

.skill-tree__details h2 {
  margin-top: 0.25vh;
  color: #ffffff;
  font-size: 1.65vh;
  line-height: 1.1;
}

.skill-tree__details p {
  color: rgb(255 255 255 / 68%);
  font-size: 1.13vh;
  font-weight: 600;
  line-height: 1.35;
}

.skill-tree__details header > button {
  position: relative;
  width: 2.8vh;
  height: 2.8vh;
  flex: 0 0 auto;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.7vh;
  background: rgb(255 255 255 / 5%);
  cursor: pointer;
}

.skill-tree__details header > button::before,
.skill-tree__details header > button::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1.15vh;
  height: 0.16vh;
  border-radius: 999px;
  background: #ffffff;
  content: "";
}

.skill-tree__details header > button::before {
  transform: translate(-50%, -50%) rotate(45deg);
}

.skill-tree__details header > button::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.skill-tree__unlock-button {
  width: 100%;
  min-height: 3.9vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(172 46 205 / 46%);
  border-radius: 0.85vh;
  background: #ac2ecd;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.22vh;
  font-weight: 600;
}

.skill-tree__unlock-button:disabled {
  border-color: rgb(255 255 255 / 8%);
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 58%);
  cursor: default;
}

.skill-tree__details-state {
  width: fit-content;
  min-height: 2.7vh;
  display: inline-flex;
  align-items: center;
  padding: 0 0.9vh;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 999px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 72%);
  font-size: 1vh;
  font-weight: 600;
}

.skill-tree__details-state--active {
  border-color: rgb(172 46 205 / 44%);
  background: rgb(172 46 205 / 18%);
  color: #ffffff;
}

.skill-tree__details ul {
  display: grid;
  gap: 0.65vh;
  margin: 0;
  padding: 0;
  list-style: none;
}

.skill-tree__details li {
  position: relative;
  padding-left: 1.35vh;
  color: rgb(255 255 255 / 76%);
  font-size: 1.08vh;
  font-weight: 600;
  line-height: 1.25;
}

.skill-tree__details li::before {
  position: absolute;
  top: 0.48vh;
  left: 0;
  width: 0.55vh;
  height: 0.55vh;
  border-radius: 50%;
  background: #ac2ecd;
  content: "";
}

.skill-tree-hint-enter-active,
.skill-tree-hint-leave-active,
.skill-tree-details-enter-active,
.skill-tree-details-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.skill-tree-hint-enter-from,
.skill-tree-hint-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.45vh);
}

.skill-tree-details-enter-from,
.skill-tree-details-leave-to {
  opacity: 0;
  transform: translateY(0.75vh);
}

@keyframes skillTreeThreadGrow {
  from {
    stroke-dashoffset: 900;
  }

  to {
    stroke-dashoffset: 0;
  }
}

@keyframes skillTreeSkillBloom {
  0% {
    opacity: 0;
    transform: scale(0.28);
  }

  68% {
    opacity: 1;
    transform: scale(1.08);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes skillTreeCenterBloom {
  0% {
    opacity: 0;
    transform: scale(0.72);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes skillTreeBranchUnlock {
  0% {
    transform: scale(1);
  }

  34% {
    transform: scale(1.055);
  }

  62% {
    transform: scale(0.988);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes skillTreeUnlockPulse {
  0% {
    transform: scale(1);
  }

  28% {
    transform: scale(1.22);
  }

  58% {
    transform: scale(0.96);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes skillTreeCellTremble {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  18% {
    transform: translate(-0.45px, 0.35px) scale(1.035);
  }

  36% {
    transform: translate(0.45px, -0.3px) scale(1.03);
  }

  54% {
    transform: translate(-0.3px, -0.45px) scale(1.04);
  }

  72% {
    transform: translate(0.35px, 0.4px) scale(1.03);
  }
}

@keyframes skillTreeIconReveal {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
