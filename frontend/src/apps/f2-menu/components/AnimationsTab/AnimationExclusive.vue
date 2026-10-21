<template>
  <section>
    <h1 class="f2-menu__title">Главная</h1>

    <div class="shop-home">
      <article class="shop-home-hero shop-home-hero--starter">
        <div>
          <h2>Эффективное начало в одном комплекте.</h2>
          <p>
            Выбирая готовый комплект, вы получаете не просто продукты, а продуманное решение<br>
            для быстрого старта. <span>Основные преимущества набора:</span>
          </p>
          <ul>
            <li>Профессиональная база. <span>Весь спектр нужных умений.</span></li>
            <li>Готовые решения. <span>Пакет лицензий под ключ.</span></li>
            <li>Денежный ресурс. <span>Капитал для эффективного старта.</span></li>
          </ul>
          <button type="button">Перейти в Стартовые наборы</button>
        </div>
      </article>

      <article class="shop-home-hero shop-home-hero--gear">
        <div>
          <h2>Снаряжение «Ликвидатор»</h2>
          <p>Этот комплект закрывает все базовые потребности в бою. <span>Основные преимущества:</span></p>
          <ul>
            <li>Ультимативное оружие. <span>Превосходство в огневой мощи.</span></li>
            <li>Броневая защита. <span>Максимальная устойчивость к урону.</span></li>
            <li>Ресурс выживания. <span>Полный запас необходимых хилок.</span></li>
          </ul>
          <button type="button">Купить набор - 1789 ₸</button>
        </div>
      </article>

      <div class="shop-home-grid" aria-label="Товары магазина">
        <span v-for="slot in 14" :key="slot"></span>
      </div>
    </div>
  </section>
</template>
