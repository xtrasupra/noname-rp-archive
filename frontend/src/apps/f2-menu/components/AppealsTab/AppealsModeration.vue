<template>
  <section>
    <h1 class="f2-menu__title">Модерация</h1>

    <div class="moderation-layout">
      <article class="moderation-column">
        <h2>На модерации</h2>

        <div class="moderation-card">
          <p><span>Автор:</span> Nyako Sinflyzuki</p>
          <p><span>Текст:</span> Проводится набор в адвокатуру.</p>
          <p><span>Требования:</span> возраст 18+, грамотная речь, знание правил сервера.</p>

          <div class="moderation-card__actions">
            <button type="button">Одобрить</button>
            <button type="button">Отклонить</button>
          </div>
        </div>
      </article>

      <article class="moderation-column">
        <h2>Граффити</h2>

        <div class="moderation-card moderation-card--graffiti">
          <img class="moderation-graffiti" src="/Frame 620.png" alt="Граффити Asmo">

          <div class="moderation-card__actions">
            <button type="button">Одобрить</button>
            <button type="button">Отклонить</button>
          </div>
        </div>
      </article>

      <article class="moderation-column">
        <h2>История</h2>

        <div class="moderation-card">
          <p><span>Автор:</span> Nyako Sinflyzuki</p>
          <p><span>Текст:</span> Проводится набор в адвокатуру.</p>
          <p><span>Требования:</span> возраст 18+, грамотная речь, знание правил сервера.</p>
          <p class="moderation-card__meta">
            <span>Рассмотрел:</span> Asmo
            <b>Итог: <i>Отклонено</i></b>
          </p>
        </div>
      </article>
    </div>
  </section>
</template>
