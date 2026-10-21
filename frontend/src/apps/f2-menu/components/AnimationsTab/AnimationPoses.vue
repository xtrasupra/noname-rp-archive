<template>
  <section class="settings-page">
    <h1 class="f2-menu__title">Настройки</h1>

    <div class="settings-page__layout">
      <nav class="settings-menu" aria-label="Разделы настроек">
        <button class="settings-menu__item settings-menu__item--active" type="button">
          <span class="settings-menu__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M10.9872 2.547C11.3952 2.673 11.7852 2.835 12.1572 3.033L13.8069 2.043C13.9789 1.93983 14.1805 1.89707 14.3796 1.92153C14.5787 1.94599 14.7639 2.03626 14.9058 2.178L15.822 3.0942C15.9637 3.23613 16.054 3.42134 16.0785 3.62044C16.1029 3.81953 16.0602 4.02108 15.957 4.1931L14.967 5.8428C15.165 6.2148 15.327 6.6048 15.453 7.0128L17.3187 7.4799C17.5133 7.52865 17.6861 7.64104 17.8095 7.79921C17.9329 7.95738 18 8.15226 18 8.3529V9.6471C18 9.84774 17.9329 10.0426 17.8095 10.2008C17.6861 10.359 17.5133 10.4713 17.3187 10.5201L15.453 10.9872C15.327 11.3952 15.165 11.7852 14.967 12.1572L15.957 13.8069C16.0602 13.9789 16.1029 14.1805 16.0785 14.3796C16.054 14.5787 15.9637 14.7639 15.822 14.9058L14.9058 15.822C14.7639 15.9637 14.5787 16.054 14.3796 16.0785C14.1805 16.1029 13.9789 16.0602 13.8069 15.957L12.1572 14.967C11.7852 15.165 11.3952 15.327 10.9872 15.453L10.5201 17.3187C10.4713 17.5133 10.359 17.6861 10.2008 17.8095C10.0426 17.9329 9.84774 18 9.6471 18H8.3529C8.15226 18 7.95738 17.9329 7.79921 17.8095C7.64104 17.6861 7.52865 17.5133 7.4799 17.3187L7.0128 15.453C6.60843 15.328 6.2167 15.1653 5.8428 14.967L4.1931 15.957C4.02108 16.0602 3.81953 16.1029 3.62044 16.0785C3.42134 16.054 3.23613 15.9637 3.0942 15.822L2.178 14.9058C2.03626 14.7639 1.94599 14.5787 1.92153 14.3796C1.89707 14.1805 1.93983 13.9789 2.043 13.8069L3.033 12.1572C2.83468 11.7833 2.67196 11.3916 2.547 10.9872L0.6813 10.5201C0.486827 10.4714 0.314189 10.3591 0.190766 10.2011C0.0673443 10.0432 0.000205778 9.84848 0 9.648V8.3538C5.27439e-06 8.15316 0.0670519 7.95828 0.19049 7.80011C0.313928 7.64194 0.486678 7.52955 0.6813 7.4808L2.547 7.0137C2.673 6.6057 2.835 6.2157 3.033 5.8437L2.043 4.194C1.93983 4.02198 1.89707 3.82043 1.92153 3.62134C1.94599 3.42224 2.03626 3.23703 2.178 3.0951L3.0942 2.178C3.23613 2.03626 3.42134 1.94599 3.62044 1.92153C3.81953 1.89707 4.02108 1.93983 4.1931 2.043L5.8428 3.033C6.2148 2.835 6.6048 2.673 7.0128 2.547L7.4799 0.6813C7.52862 0.486827 7.64087 0.314189 7.79886 0.190766C7.95685 0.0673443 8.15152 0.000205778 8.352 0H9.6462C9.84684 5.27439e-06 10.0417 0.0670519 10.1999 0.19049C10.3581 0.313928 10.4704 0.486678 10.5192 0.6813L10.9872 2.547ZM9 12.6C9.95478 12.6 10.8705 12.2207 11.5456 11.5456C12.2207 10.8705 12.6 9.95478 12.6 9C12.6 8.04522 12.2207 7.12955 11.5456 6.45442C10.8705 5.77928 9.95478 5.4 9 5.4C8.04522 5.4 7.12955 5.77928 6.45442 6.45442C5.77928 7.12955 5.4 8.04522 5.4 9C5.4 9.95478 5.77928 10.8705 6.45442 11.5456C7.12955 12.2207 8.04522 12.6 9 12.6Z" fill="white"/>
            </svg>
          </span>
          <strong>Основное</strong>
        </button>

        <div class="settings-menu__subnav" :style="{ '--active-settings-tab-index': String(activeTabIndex) }">
          <button
            type="button"
            :class="{ 'settings-menu__subnav-button--active': activeTab === 'interface' }"
            @click="activeTab = 'interface'"
          >
            Интерфейс
          </button>
          <button
            type="button"
            :class="{ 'settings-menu__subnav-button--active': activeTab === 'additional' }"
            @click="activeTab = 'additional'"
          >
            Дополнительно
          </button>
        </div>

        <button class="settings-menu__item" type="button">
          <span class="settings-menu__icon" aria-hidden="true">
            <svg width="15" height="13" viewBox="0 0 15 13" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12.9659 2.82462C13.0688 2.72199 13.2082 2.66435 13.3537 2.66435C13.4991 2.66435 13.6386 2.72199 13.7415 2.82462L13.7429 2.82608L13.7451 2.82754L13.7502 2.83266L13.7649 2.84727L13.8102 2.89769C13.8468 2.93934 13.898 2.99852 13.9573 3.07378C14.6334 3.95131 15 5.02742 15 6.1346C15 7.24179 14.6334 8.3179 13.9573 9.19543C13.896 9.27352 13.8316 9.34908 13.7641 9.42194L13.7495 9.43655L13.7451 9.44167L13.7429 9.44313L13.7422 9.44386L13.369 9.07267L13.7422 9.44532C13.6392 9.54813 13.4996 9.60588 13.354 9.60588C13.2084 9.60588 13.0688 9.54813 12.9659 9.44532C12.8629 9.34251 12.8051 9.20308 12.8051 9.05769C12.8051 8.91231 12.8629 8.77287 12.9659 8.67007L12.9651 8.6708L12.9637 8.67153L12.9673 8.66788L12.9915 8.64157C13.0149 8.61624 13.0488 8.57557 13.0932 8.51955C13.5561 7.9161 13.8335 7.19137 13.8917 6.43345C13.9499 5.67553 13.7863 4.91704 13.421 4.25018C13.3256 4.07467 13.216 3.90727 13.0932 3.74966C13.0534 3.69838 13.0114 3.64889 12.9673 3.60133L12.9637 3.59768C12.8616 3.4947 12.8046 3.35556 12.805 3.2107C12.8054 3.06583 12.8632 2.92702 12.9659 2.82462ZM8.62463 0.213165C9.47561 -0.347267 10.6098 0.262852 10.6098 1.28069V11.7192C10.6098 12.7378 9.47561 13.3472 8.62463 12.7867L4.23439 9.89688C4.20469 9.8771 4.16984 9.86644 4.13415 9.86619H2.0122C1.47853 9.86619 0.966718 9.65449 0.589358 9.27766C0.211999 8.90083 0 8.38974 0 7.85682V5.14307C0 4.61015 0.211999 4.09906 0.589358 3.72223C0.966718 3.3454 1.47853 3.1337 2.0122 3.1337H4.13415C4.17002 3.13381 4.20513 3.1234 4.23512 3.10374L8.62463 0.213165Z" fill="white"/>
            </svg>
          </span>
          <strong>Настройка звука</strong>
        </button>

        <button class="settings-menu__item" type="button">
          <span class="settings-menu__icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 0C5.87827 0 3.84344 0.842854 2.34315 2.34314C0.842855 3.84343 0 5.87826 0 7.99999C0 9.27835 0.300308 10.4886 0.835282 11.5627C0.920615 11.735 0.928821 11.9918 0.831179 12.3914C0.779474 12.5932 0.719249 12.7928 0.650667 12.9895L0.626051 13.0601C0.565333 13.2406 0.499692 13.4375 0.450462 13.6205C0.137026 14.7914 1.20862 15.863 2.37867 15.5495C2.56246 15.5003 2.75856 15.4347 2.9399 15.3739L3.01046 15.3493C3.20721 15.2807 3.40677 15.2205 3.60862 15.1688C4.0082 15.0703 4.26503 15.0786 4.43733 15.1647C5.5439 15.7161 6.76369 16.002 8 16C12.4185 16 16 12.4185 16 7.99999C16 3.58154 12.4185 0 8 0Z" fill="white"/>
            </svg>
          </span>
          <strong>Настройка чата</strong>
        </button>

        <button class="settings-menu__item" type="button">
          <span class="settings-menu__icon" aria-hidden="true">
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.7 12C1.2325 12 0.832433 11.8323 0.4998 11.4969C0.167167 11.1614 0.000566667 10.7577 0 10.2857V1.71429C0 1.24286 0.1666 0.839428 0.4998 0.504C0.833 0.168571 1.23307 0.000571429 1.7 0H15.3C15.7675 0 16.1678 0.168 16.501 0.504C16.8342 0.84 17.0006 1.24343 17 1.71429V10.2857C17 10.7571 16.8337 11.1609 16.501 11.4969C16.1684 11.8329 15.7681 12.0006 15.3 12H1.7ZM1.7 10.2857H15.3V1.71429H1.7V10.2857ZM5.1 9.42857H11.9V7.71428H5.1V9.42857ZM2.55 6.85714H4.25V5.14286H2.55V6.85714ZM5.1 6.85714H6.8V5.14286H5.1V6.85714ZM7.65 6.85714H9.35V5.14286H7.65V6.85714ZM10.2 6.85714H11.9V5.14286H10.2V6.85714ZM12.75 6.85714H14.45V5.14286H12.75V6.85714ZM2.55 4.28571H4.25V2.57143H2.55V4.28571ZM5.1 4.28571H6.8V2.57143H5.1V4.28571ZM7.65 4.28571H9.35V2.57143H7.65V4.28571ZM10.2 4.28571H11.9V2.57143H10.2V4.28571ZM12.75 4.28571H14.45V2.57143H12.75V4.28571Z" fill="white"/>
            </svg>
          </span>
          <strong>Назначение клавиш</strong>
        </button>

        <button class="settings-menu__item" type="button">
          <span class="settings-menu__icon" aria-hidden="true">
            <svg width="15" height="17" viewBox="0 0 15 17" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M6.8685 0.105328C7.24314 -0.0351093 7.65598 -0.0351093 8.03063 0.105328L13.8247 2.27812C14.1403 2.39643 14.4123 2.60826 14.6043 2.8853C14.7963 3.16234 14.8992 3.49139 14.8991 3.82845V8.26756C14.8992 9.65105 14.5139 11.0072 13.7866 12.1841C13.0593 13.361 12.0186 14.3121 10.7812 14.9308L8.00497 16.3181C7.83253 16.4043 7.64237 16.4492 7.44956 16.4492C7.25675 16.4492 7.0666 16.4043 6.89416 16.3181L4.11795 14.93C2.88053 14.3112 1.83985 13.3601 1.11253 12.1833C0.385201 11.0064 -2.95144e-05 9.65022 3.22949e-07 8.26674V3.82928C-0.000210251 3.49207 0.10256 3.16285 0.294562 2.88564C0.486565 2.60844 0.758641 2.39648 1.07439 2.27812L6.8685 0.105328ZM8.27729 7.99938C8.59287 7.81716 8.8395 7.5359 8.97895 7.19923C9.11839 6.86255 9.14285 6.48927 9.04854 6.13728C8.95422 5.78529 8.7464 5.47425 8.45729 5.25241C8.16819 5.03056 7.81397 4.91031 7.44956 4.91029C7.08515 4.91031 6.73093 5.03056 6.44183 5.25241C6.15273 5.47425 5.9449 5.78529 5.85059 6.13728C5.75627 6.48927 5.78073 6.86255 5.92017 7.19923C6.05962 7.5359 6.30625 7.81716 6.62183 7.99938V10.7044C6.62183 10.9239 6.70904 11.1345 6.86427 11.2897C7.0195 11.4449 7.23003 11.5321 7.44956 11.5321C7.66909 11.5321 7.87962 11.4449 8.03485 11.2897C8.19008 11.1345 8.27729 10.9239 8.27729 10.7044V7.99938Z" fill="white"/>
            </svg>
          </span>
          <strong>Безопасность</strong>
        </button>
      </nav>

      <div
        v-if="activeTab === 'interface'"
        class="settings-fields"
        aria-label="Настройки интерфейса"
      >
        <span v-for="field in 4" :key="field"></span>
      </div>

      <div v-else class="settings-fields settings-fields--additional" aria-label="Дополнительные настройки">
        <AnimationPositive :show-title="false" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import AnimationPositive from './AnimationPositive.vue'

type SettingsTab = 'interface' | 'additional'

const activeTab = ref<SettingsTab>('additional')
const activeTabIndex = computed(() => activeTab.value === 'interface' ? 0 : 1)
</script>

<style scoped>
.settings-page {
  position: relative;
  min-height: 80vh;
  isolation: isolate;
}

.settings-page__layout {
  display: grid;
  grid-template-columns: 33.2vh minmax(0, 93vh);
  gap: 3vh;
  margin-top: 2.1vh;
}

.settings-menu {
  display: grid;
  align-content: start;
  gap: 0.62vh;
}

.settings-menu__item,
.settings-menu__subnav button {
  width: 100%;
  min-height: 3.95vh;
  display: flex;
  align-items: center;
  gap: 0.78vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 0.52vh;
  background: rgb(0 0 0 / 72%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  box-sizing: border-box;
}

.settings-menu__item {
  padding: 0 1.05vh;
}

.settings-menu__item strong {
  font-size: 1.25vh;
  font-weight: 600;
  line-height: 1;
}

.settings-menu__item--active {
  background: rgb(0 0 0 / 78%);
}

.settings-menu__icon {
  width: 1.45vh;
  height: 1.45vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #ffffff;
  font-size: 1.12vh;
  line-height: 1;
}

.settings-menu__icon svg {
  display: block;
  max-width: 100%;
  max-height: 100%;
}

.settings-menu__subnav {
  position: relative;
  display: grid;
  gap: 0.5vh;
  padding-left: 2.32vh;
}

.settings-menu__subnav::before {
  position: absolute;
  left: 1.45vh;
  top: 0.04vh;
  width: 0.18vh;
  height: 7.95vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 12%);
  content: "";
}

.settings-menu__subnav::after {
  position: absolute;
  left: 1.45vh;
  top: calc(var(--active-settings-tab-index, 0) * 3.95vh + 0.04vh);
  width: 0.18vh;
  height: 3.45vh;
  border-radius: 999px;
  background: #ffffff;
  content: "";
  transition: top 180ms ease;
}

.settings-menu__subnav button {
  justify-content: flex-start;
  min-height: 3.45vh;
  padding: 0 1.15vh;
  font-size: 1.02vh;
  text-align: left;
}

.settings-menu__subnav-button--active {
  background: rgb(0 0 0 / 82%);
}

.settings-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 30.6vh));
  gap: 0.75vh;
  align-content: start;
}

.settings-fields--additional {
  display: block;
}

.settings-fields--additional :deep(.interface-page) {
  display: block;
}

.settings-fields--additional :deep(.crosshair-panel) {
  width: 100%;
  margin-top: 0;
}

.settings-fields span {
  min-height: 3.75vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 0.35vh;
  background: rgb(0 0 0 / 72%);
}
</style>
