<template>
  <section class="top-up">
    <h1 class="f2-menu__title">Пополнение</h1>

    <div class="top-up__layout">
      <div class="top-up__form">
        <div class="top-up__inputs">
          <label class="top-up__field">
            <span class="top-up__field-icon">$</span>
            <input type="text" inputmode="numeric" placeholder="Введите сумму">
            <strong class="top-up__amount">- 0 <span>T</span></strong>
          </label>

          <label class="top-up__field">
            <span class="top-up__field-icon top-up__field-icon--mail">✉</span>
            <input type="email" value="blablabla@gmail.com" aria-label="Email">
            <span class="top-up__eye" aria-hidden="true"></span>
          </label>
        </div>

        <h2>Выберите способ оплаты</h2>

        <div class="top-up__methods" aria-label="Способы оплаты">
          <button v-for="method in 12" :key="method" type="button"></button>
        </div>

        <div class="top-up__agreements">
          <label>
            <input type="checkbox">
            <span>Продолжая, я соглашаюсь с <a href="#">условиями оферты</a></span>
          </label>

          <label>
            <input type="checkbox">
            <span>
              Я согласен активировать контент в своей учетной записи NoName RP, понимая что
              после этого не смогу расторгнуть договор или получить возмещение
            </span>
          </label>
        </div>

        <button class="top-up__submit" type="button">Перейти к оплате</button>
      </div>

      <aside class="top-up__info">
        <h2>Информация про донат</h2>
        <p>Валюта NoName Coin открывает следующие возможности для вашего игрового процесса:</p>

        <ul>
          <li><strong>Персонализация:</strong> <span>создание уникального облика для вашего персонажа.</span></li>
          <li><strong>Экономика:</strong> <span>приобретение необходимой внутриигровой валюты.</span></li>
          <li><strong>Наборы:</strong> <span>покупка кейсов с ценным содержимым и другие эксклюзивные товары.</span></li>
        </ul>

        <p>
          Процесс зачисления полностью автоматизирован: средства поступят на баланс вашего аккаунта
          мгновенно после успешного проведения платежа.
        </p>

        <p>
          <strong>Курс валюты:</strong><br>
          Пополняйте баланс по курсу 1 доллар = 1 NoName Coin и делайте свой игровой процесс еще ярче.
        </p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.top-up {
  position: relative;
  isolation: isolate;
  min-height: 80vh;
}

.top-up__layout {
  display: grid;
  grid-template-columns: minmax(0, 53.3vh) minmax(28vh, 37vh);
  gap: 5vh;
  margin-top: 3.85vh;
}

.top-up__form {
  min-width: 0;
}

.top-up__inputs {
  display: grid;
  grid-template-columns: minmax(0, 26.2vh) minmax(0, 25.2vh);
  gap: 1.25vh;
}

.top-up__field {
  min-width: 0;
  height: 3.35vh;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8vh;
  padding: 0 0.95vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 0.75vh;
  background: rgb(0 0 0 / 70%);
  box-sizing: border-box;
}

.top-up__field-icon {
  width: 1.45vh;
  height: 1.45vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #d329c7;
  color: #ffffff;
  font-size: 1vh;
  font-weight: 600;
  line-height: 1;
}

.top-up__field-icon--mail {
  font-size: 0.85vh;
}

.top-up__field input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 1.18vh;
  line-height: 1;
}

.top-up__field input::placeholder {
  color: rgb(255 255 255 / 72%);
}

.top-up__field strong {
  display: flex;
  color: #ffffff;
  font-size: 1.1vh;
  line-height: 1;
  white-space: nowrap;
}

.top-up__amount span {
  width: 1.2vh;
  height: 1.2vh;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.2vh;
  border-radius: 50%;
  background:
    radial-gradient(circle at 38% 32%, rgb(255 255 255 / 24%), transparent 38%),
    #1a1717;
  color: #ffffff;
  font-size: 0.82vh;
  font-style: italic;
  font-weight: 600;
  line-height: 1;
  vertical-align: -0.08vh;
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 16%);
}

.top-up__eye {
  position: relative;
  width: 1.35vh;
  height: 0.82vh;
  border: 0.16vh solid rgb(255 255 255 / 70%);
  border-radius: 50%;
  transform: rotate(-14deg);
}

.top-up__eye::before {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.34vh;
  height: 0.34vh;
  border-radius: 50%;
  background: rgb(255 255 255 / 70%);
  content: "";
  transform: translate(-50%, -50%);
}

.top-up__eye::after {
  position: absolute;
  left: -0.18vh;
  top: 50%;
  width: 1.74vh;
  height: 0.16vh;
  border-radius: 999px;
  background: rgb(255 255 255 / 78%);
  content: "";
  transform: translateY(-50%) rotate(42deg);
}

.top-up__form h2,
.top-up__info h2 {
  margin: 2.6vh 0 0;
  color: #ffffff;
  font-size: 1.8vh;
  line-height: 1;
}

.top-up__methods {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9vh 1.2vh;
  margin-top: 2.35vh;
}

.top-up__methods button {
  height: 8.4vh;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 1vh;
  background: rgb(0 0 0 / 76%);
  cursor: pointer;
}

.top-up__agreements {
  display: grid;
  gap: 0.58vh;
  margin: 1.05vh 0 0.85vh;
}

.top-up__agreements label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.42vh;
  color: rgb(255 255 255 / 86%);
  font-size: 0.74vh;
  line-height: 1.2;
}

.top-up__agreements input {
  width: 1.05vh;
  height: 1.05vh;
  margin: 0.02vh 0 0;
  accent-color: #d329c7;
}

.top-up__agreements a {
  color: #ffffff;
  text-decoration: underline;
  text-underline-offset: 0.14vh;
}

.top-up__submit {
  width: 40vh;
  min-height: 4.5vh;
  display: block;
  margin: 1.45vh auto 0;
  border: 1px solid rgb(255 255 255 / 3%);
  border-radius: 0.8vh;
  background: rgb(0 0 0 / 82%);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 1.15vh;
}

.top-up__info {
  padding-top: 0.65vh;
}

.top-up__info h2 {
  margin-top: 0;
}

.top-up__info p,
.top-up__info li {
  margin: 0;
  color: #ffffff;
  font-size: 1.18vh;
  line-height: 1.32;
}

.top-up__info p {
  margin-top: 0.8vh;
}

.top-up__info ul {
  display: grid;
  gap: 0.2vh;
  margin: 0.55vh 0 0;
  padding-left: 1.75vh;
}

.top-up__info strong {
  color: #ffffff;
}

.top-up__info li span {
  color: rgb(255 255 255 / 58%);
}
</style>
