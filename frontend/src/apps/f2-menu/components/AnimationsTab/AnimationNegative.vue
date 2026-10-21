<template>
  <section class="starter-pack">
    <h1 class="f2-menu__title">Стартовый набор</h1>

    <div class="starter-pack__panel">
      <div class="starter-pack__header">
        <span v-for="pack in packs" :key="pack">{{ pack }}</span>
      </div>

      <div class="starter-pack__divider"></div>

      <h2>Преимущества</h2>

      <div class="starter-pack__columns">
        <article v-for="pack in packs" :key="pack">
          <button type="button"></button>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const packs = ['Набор Искра', 'Набор Пламя', 'Набор Шторм', 'Набор Сверхновая']
</script>

<style scoped>
.starter-pack {
  position: relative;
}

.starter-pack__panel {
  position: relative;
  min-height: 62.8vh;
  margin-top: 3.55vh;
  padding: 11.5vh 0 1.1vh;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 1.2vh;
  background:
    radial-gradient(72vh 46vh at 54% 44%, rgb(255 255 255 / 4%), transparent 76%),
    linear-gradient(90deg, rgb(0 0 0 / 50%), rgb(18 18 18 / 56%) 50%, rgb(0 0 0 / 50%)),
    linear-gradient(180deg, rgb(4 4 4 / 94%), rgb(12 12 12 / 96%) 56%, rgb(5 5 5 / 96%));
  box-sizing: border-box;
  overflow: hidden;
}

.starter-pack__header {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
  min-height: 1.6vh;
  padding: 0 4.9vh;
}

.starter-pack__header span {
  color: #ffffff;
  font-size: 16px;
  line-height: 1;
  text-align: center;
}

.starter-pack__divider {
  position: relative;
  z-index: 1;
  height: 0.18vh;
  margin-top: 0.95vh;
  background: #ffffff;
}

.starter-pack__panel h2 {
  margin: 1.25vh 0 0;
  color: #ffffff;
  font-size: 1vh;
  font-weight: 600;
  line-height: 1;
  text-align: center;
}

.starter-pack__columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-height: 39.8vh;
  padding: 1.35vh 4.9vh 0;
}

.starter-pack__columns article {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 39.8vh;
}

.starter-pack__columns article:not(:last-child)::after {
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 39.8vh;
  background: linear-gradient(180deg, rgb(255 255 255 / 34%), rgb(255 255 255 / 10%));
  content: "";
}

.starter-pack__columns button {
  width: 11.1vh;
  height: 2.25vh;
  margin-top: auto;
  border: 1px solid rgb(255 255 255 / 1.5%);
  border-radius: 0.18vh;
  background: rgb(0 0 0 / 54%);
  cursor: pointer;
}
</style>
