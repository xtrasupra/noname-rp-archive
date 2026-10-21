"use strict";

const taxiConfig = require("../jobs/taxi/taxi.config.js");
const deliveryConfig = require("../jobs/delivery/delivery.config.js");
const truckerConfig = require("../jobs/trucker/trucker.config.js");
const miningConfig = require("../jobs/mining/mining.config.js");
const forestryConfig = require("../jobs/forestry/forestry.config.js");
const armoredCollectorConfig = require("../jobs/armoredCollector/armoredCollector.config.js");
const cargoLoaderConfig = require("../jobs/cargoLoader/cargoLoader.config.js");
const AUTO_SERVICE = require("../autoService/autoService.config.js");
const { STARTER_VEHICLE_DEALERSHIP } = require("../quests/quest.config.js");
const systemFactory = require("../../data/system-factory.json");

const DEFAULT_NPC_DIALOG = {
  profession: "Путеводитель",
  model: "a_m_y_business_01",
  scenario: "WORLD_HUMAN_CLIPBOARD",
  colshapeRadius: 5,
  startNode: "start",

  blip: {
    sprite: 280,
    color: 3,
    scale: 0.8,
    name: "Путеводитель",
  },
};

const NPC_DIALOGS = [
  {
    id: "driving_school_instructor",
    name: "Michael Reed",
    profession: "Инструктор автошколы",
    model: "s_m_m_autoshop_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: new mp.Vector3(-838.865, -161.244, 37.805),
    heading: 79.928,
    colshapeRadius: 4,
    theme: "purple",
    blip: {
      sprite: 498,
      color: 2,
      scale: 0.85,
      name: "Автошкола",
    },
    nodes: {
      start: {
        message:
          "Добро пожаловать в автошколу. Перед платным экзаменом можно бесплатно изучить все вопросы с правильными ответами и пояснениями. Экзамен категории B включает десять вопросов по ПДД РФ и практический маршрут. Здесь же после категории B оформляются коммерческие CDL B и CDL A.",
        actions: [
          {
            id: "study_theory",
            label: "Изучить теорию бесплатно",
            action: "drivingSchoolStudy",
          },
          {
            id: "category_b",
            label: "Сдать экзамен категории B — $100",
            action: "drivingSchoolOpen",
          },
          {
            id: "category_a",
            label: "Категория A — скоро",
            action: "drivingSchoolStubA",
          },
          {
            id: "category_c",
            label: "Категория C — скоро",
            action: "drivingSchoolStubC",
          },
          {
            id: "commercial_licenses",
            label: "Оформить коммерческую категорию CDL",
            next: "commercial_licenses",
          },
        ],
      },
      commercial_licenses: {
        message:
          "CDL B доступна после получения обычной категории B и физического документа. CDL A требует уже действующую CDL B и открывает тягачи с прицепами. Обе категории сохраняются у персонажа.",
        actions: [
          { id: "cdl_b", label: `Оформить CDL B — $${truckerConfig.cdl.b.price}`, action: "drivingSchoolCdl:cdl_b", next: "commercial_licenses" },
          { id: "cdl_a", label: `Оформить CDL A — $${truckerConfig.cdl.a.price}`, action: "drivingSchoolCdl:cdl_a", next: "commercial_licenses" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
    },
  },
  {
    id: "guide_airport",
    name: "Jung Lee",

    position: new mp.Vector3(-1037.75, -2737.62, 20.17),
    heading: 327.0,

    nodes: {
      start: {
        message:
          "Добро пожаловать в Los Santos. Я помогу тебе быстро освоиться: работа, транспорт, жильё и первые деньги. С чего начнём?",

        actions: [
          {
            id: "quest",
            label: "Хочу стартовый квест",
            next: "quest_info",
          },
          {
            id: "how_start",
            label: "Что делать новичку?",
            next: "how_start",
          },
          {
            id: "transport",
            label: "Мне нужен транспорт",
            next: "transport",
          },
          {
            id: "jobs",
            label: "Какие есть работы?",
            next: "jobs",
          },
          {
            id: "cancelQuest",
            label: "Отменить стартовый квест",
            action: "cancelQuest",
            onlyIf: "hasQuest",
          },
        ],
      },

      quest_info: {
        message:
          "Стартовый квест проведёт тебя по базовым местам: документы, первая работа, аренда транспорта и первые деньги. После него ты уже будешь понимать, куда двигаться дальше.",

        actions: [
          {
            id: "startQuest",
            label: "Начать стартовый квест",
            action: "startStarterQuest",
            next: "quest_started",
          },
          {
            id: "questReward",
            label: "Какая награда?",
            next: "quest_reward",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      quest_started: {
        message:
          "Отлично. Первым делом осмотрись вокруг аэропорта, затем отправляйся в город и найди работу. Если нужен транспорт — я подскажу, где его взять.",

        actions: [
          {
            id: "transport",
            label: "Мне нужен транспорт",
            next: "transport",
          },
          {
            id: "jobs",
            label: "Где взять работу?",
            next: "jobs",
          },
          {
            id: "back",
            label: "В начало",
            next: "start",
          },
        ],
      },

      quest_reward: {
        message:
          "Награда зависит от этапов. Обычно это первые деньги, опыт и понимание основных систем сервера. Главное — не спеши, квест нужен чтобы спокойно войти в игру.",

        actions: [
          {
            id: "startQuest",
            label: "Начать квест",
            action: "startStarterQuest",
            next: "quest_started",
          },
          {
            id: "back",
            label: "Назад",
            next: "quest_info",
          },
        ],
      },

      how_start: {
        message:
          "Совет новичку: сначала получи документы, потом возьми простую работу, накопи на аренду транспорта и изучи карту. Не трать все деньги сразу.",

        actions: [
          {
            id: "startQuest",
            label: "Начать стартовый квест",
            action: "startStarterQuest",
          },
          {
            id: "cancelQuest",
            label: "Отменить стартовый квест",
            action: "cancelQuest",
            onlyIf: "hasQuest",
          },
          {
            id: "documents",
            label: "Где получить документы?",
            next: "documents",
          },
          {
            id: "job",
            label: "Где найти работу?",
            next: "jobs",
          },
          {
            id: "money",
            label: "Как быстро заработать?",
            next: "money",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      documents: {
        message:
          "Документы обычно оформляются в государственных учреждениях. Найди мэрию или ближайший пункт оформления. Без документов часть возможностей может быть ограничена.",

        actions: [
          {
            id: "cityhall",
            label: "Расскажи про мэрию",
            next: "cityhall",
          },
          {
            id: "back",
            label: "Назад",
            next: "how_start",
          },
        ],
      },

      cityhall: {
        message:
          "В мэрии можно узнать про документы, государственные услуги и официальные организации. Там же часто начинаются первые легальные пути развития персонажа.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "documents",
          },
          {
            id: "start",
            label: "В начало",
            next: "start",
          },
        ],
      },

      transport: {
        message:
          "На старте лучше не покупать транспорт сразу. Возьми рабочую машину на работе или воспользуйся такси. Так ты не потратишь лишние деньги.",

        actions: [
          {
            id: "starterVehicle",
            label: "Получить стартовый транспорт",
            action: "giveStarterTransport",
            next: "transport_after_starter",
          },
          {
            id: "taxi",
            label: "Как пользоваться такси?",
            next: "taxi",
          },
          {
            id: "jobs",
            label: "Лучше пойду на работу",
            next: "jobs",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      transport_after_starter: {
        message:
          "Если транспорт выдан — используй его аккуратно. Следи за топливом, не бросай машину где попало и помни: рабочий транспорт выгоднее для заработка.",

        actions: [
          {
            id: "jobs",
            label: "Покажи работы",
            next: "jobs",
          },
          {
            id: "back",
            label: "В начало",
            next: "start",
          },
        ],
      },

      taxi: {
        message:
          "Такси удобно, когда нет своей машины. Также можешь сам устроиться таксистом и начать зарабатывать на поездках других игроков.",

        actions: [
          {
            id: "taxiJob",
            label: "Хочу работать таксистом",
            next: "jobs_taxi",
          },
          {
            id: "back",
            label: "Назад",
            next: "transport",
          },
        ],
      },

      jobs: {
        message:
          "Для старта подойдут курьер, доставщик или таксист. Такси требует внимательности, доставка проще и стабильнее, курьер помогает быстро изучить город.",

        actions: [
          {
            id: "taxi",
            label: "Про такси",
            next: "jobs_taxi",
          },
          {
            id: "delivery",
            label: "Про доставку",
            next: "jobs_delivery",
          },
          {
            id: "money",
            label: "Что выгоднее?",
            next: "money",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      jobs_taxi: {
        message:
          "Таксист зарабатывает на заказах. Чем быстрее и аккуратнее довезёшь клиента, тем лучше. Для начала нужно устроиться и арендовать рабочий автомобиль.",

        actions: [
          {
            id: "taxiInfo",
            label: "Где устроиться?",
            next: "taxi",
          },
          {
            id: "back",
            label: "Назад",
            next: "jobs",
          },
        ],
      },

      jobs_delivery: {
        message:
          "Доставка — хороший старт. Берёшь рабочий транспорт, получаешь маршрут, отвозишь груз и получаешь оплату. Главное — не бросать маршрут.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "jobs",
          },
        ],
      },

      money: {
        message:
          "Самый безопасный путь — начать с простой работы, не покупать дорогие вещи и накопить первый капитал. Потом уже можно думать о доме, бизнесе или фракции.",

        actions: [
          {
            id: "jobs",
            label: "Покажи работы",
            next: "jobs",
          },
          {
            id: "housing",
            label: "А жильё когда покупать?",
            next: "housing_hint",
          },
          {
            id: "back",
            label: "Назад",
            next: "how_start",
          },
        ],
      },

      housing_hint: {
        message:
          "Жильё лучше покупать, когда у тебя уже есть стабильный доход. Не забывай про налоги и расходы — дом без денег быстро станет проблемой.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "money",
          },
          {
            id: "start",
            label: "В начало",
            next: "start",
          },
        ],
      },
    },
  },

  {
    id: "guide_cityhall",
    name: "Alex Carter",
    model: "s_m_m_highsec_01",
    scenario: "WORLD_HUMAN_GUARD_STAND",

    position: new mp.Vector3(-545.42, -204.18, 38.21),
    heading: 210.0,

    nodes: {
      start: {
        message:
          "Приветствую. Здесь можно узнать про документы, государственные структуры и законный путь развития персонажа.",

        actions: [
          {
            id: "documents",
            label: "Где получить документы?",
            next: "documents",
          },
          {
            id: "government",
            label: "Расскажи про гос. структуры",
            next: "government",
          },
          {
            id: "law",
            label: "Что важно знать о законах?",
            next: "law",
          },
        ],
      },

      documents: {
        message:
          "Документы являются физическими предметами. Пройди оформление в мэрии, получи ID-карту в инвентарь и не теряй её: без предмета документ нельзя показать через меню взаимодействия.",

        actions: [
          {
            id: "claim_identity",
            label: "Пройти оформление ID-карты",
            action: "claimIdentityDocument",
            next: "documents_received",
          },
          {
            id: "where",
            label: "Куда идти дальше?",
            next: "documents_where",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      documents_received: {
        message:
          "Оформление завершено. ID-карта находится в инвентаре. Остальные документы выдаются соответствующими службами: лицензии — после обучения или оформления, медицинские справки — через EMS.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "documents",
          },
        ],
      },

      documents_where: {
        message:
          "Следи за метками на карте и подсказками. Обычно оформление начинается в государственных зданиях или специальных стойках обслуживания.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "documents",
          },
        ],
      },

      government: {
        message:
          "В штате работают LSPD, EMS, Government, FIB и другие структуры. Это путь для тех, кто хочет играть законопослушного персонажа и строить карьеру.",

        actions: [
          {
            id: "career",
            label: "Как попасть во фракцию?",
            next: "career",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      career: {
        message:
          "Обычно нужно следить за наборами, пройти собеседование и соответствовать требованиям организации. Репутация персонажа тоже имеет значение.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "government",
          },
        ],
      },

      law: {
        message:
          "Главное правило простое: не путай IC и OOC, уважай роль других игроков и не нарушай законы штата без готовности отвечать за последствия.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },
    },
  },

  {
    id: "guide_legion",
    name: "Sarah Wilson",
    model: "a_f_y_business_02",
    scenario: "WORLD_HUMAN_STAND_IMPATIENT",

    position: new mp.Vector3(203.51, -920.74, 30.69),
    heading: 140.0,

    nodes: {
      start: {
        message:
          "Добро пожаловать в центр города. Здесь легко найти людей, работу, жильё и первые знакомства.",

        actions: [
          {
            id: "startQuest",
            label: "Начать стартовый квест",
            action: "startStarterQuest",
          },
          {
            id: "cancelQuest",
            label: "Отменить стартовый квест",
            action: "cancelQuest",
            onlyIf: "hasQuest",
          },
          {
            id: "housing",
            label: "Как купить жильё?",
            next: "housing",
          },
          {
            id: "business",
            label: "Как открыть бизнес?",
            next: "business",
          },
          {
            id: "city",
            label: "Что есть рядом?",
            next: "city",
          },
        ],
      },

      housing: {
        message:
          "Свободные дома отмечены маркерами. Перед покупкой проверь цену, налоги, расположение и удобство парковки.",

        actions: [
          {
            id: "taxes",
            label: "Есть налоги?",
            next: "housing_taxes",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      housing_taxes: {
        message:
          "Да, недвижимость может требовать регулярных платежей. Не покупай дом на последние деньги, сначала обеспечь стабильный доход.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "housing",
          },
        ],
      },

      business: {
        message:
          "Бизнес требует капитала и понимания экономики. Начинай с работы, накопи деньги, изучи спрос и только потом вкладывайся.",

        actions: [
          {
            id: "risk",
            label: "Какие риски?",
            next: "business_risk",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      business_risk: {
        message:
          "Главные риски — налоги, конкуренция, плохое место и отсутствие оборота. Бизнес должен приносить деньги, а не просто красиво выглядеть.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "business",
          },
        ],
      },

      city: {
        message:
          "Рядом часто собираются игроки, проходят встречи и появляются возможности для RP. Не бойся общаться — это лучший способ найти сюжет.",

        actions: [
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },
    },
  },

  {
    id: taxiConfig.npc.id,
    name: taxiConfig.npc.name,
    profession: taxiConfig.npc.profession,
    model: taxiConfig.npc.model,
    position: taxiConfig.npc.position,
    heading: taxiConfig.npc.heading,
    colshapeRadius: taxiConfig.npc.colshapeRadius,
    scenario: taxiConfig.npc.scenario,
    blip: taxiConfig.blip,

    startNode: "start",

    nodes: {
      start: {
        message:
          "Здравствуйте. Такси — работа для тех, кто хорошо ориентируется в городе и умеет быстро реагировать на заказы.",

        actions: [
          {
            id: "joinTaxi",
            label: "Устроиться таксистом",
            action: "taxiJoin",
            next: "after_join",
          },
          {
            id: "rentTaxi",
            label: "Арендовать машину",
            next: "rent",
          },
          {
            id: "howWork",
            label: "Как работает такси?",
            next: "how_work",
          },
          {
            id: "leaveTaxi",
            label: "Уволиться с работы",
            action: "taxiLeave",
            next: "after_leave",
          },
        ],
      },

      after_join: {
        message:
          "Вы устроились таксистом. Следующий шаг — арендовать рабочую машину. Без неё вы не сможете принимать и выполнять заказы.",

        actions: [
          {
            id: "rentTaxi",
            label: "Перейти к аренде машины",
            next: "rent",
          },
          {
            id: "howWork",
            label: "Сначала объясните правила",
            next: "how_work",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      after_leave: {
        message:
          "Вы уволились с работы таксиста. Если передумаете — можете устроиться снова в любой момент.",

        actions: [
          {
            id: "joinTaxi",
            label: "Устроиться обратно",
            action: "taxiJoin",
            next: "after_join",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      how_work: {
        message:
          "После аренды машины ожидайте заказ. Когда заказ появится — езжайте к клиенту, затем доставьте его до точки. Не бросайте клиента и следите за состоянием машины.",

        actions: [
          {
            id: "rentTaxi",
            label: "Арендовать машину",
            next: "rent",
          },
          {
            id: "tips",
            label: "Советы таксисту",
            next: "tips",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      tips: {
        message:
          "Совет: держите полный бак, не нарушайте ПДД рядом с полицией, не игнорируйте клиентов и выбирайте быстрые маршруты без лишнего риска.",

        actions: [
          {
            id: "rentTaxi",
            label: "Перейти к аренде",
            next: "rent",
          },
          {
            id: "back",
            label: "Назад",
            next: "how_work",
          },
        ],
      },

      rent: {
        message:
          "Выберите рабочий автомобиль. Чем дороже аренда, тем комфортнее машина, но на старте лучше не рисковать большими расходами.",

        actions: [
          ...taxiConfig.vehicles.map((vehicle) => ({
            id: `rent_taxi_${vehicle.id}`,
            label: `${vehicle.name} — $${vehicle.rentPrice}`,
            action: `taxiRent:${vehicle.id}`,
            next: "after_rent",
          })),
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      after_rent: {
        message:
          "Машина арендована. Теперь выезжайте на линию и ожидайте заказ. Если заказов нет — оставайтесь в городе, где больше игроков.",

        actions: [
          {
            id: "tips",
            label: "Советы по работе",
            next: "tips",
          },
          {
            id: "back",
            label: "В начало",
            next: "start",
          },
        ],
      },
    },
  },

  {
    id: deliveryConfig.npc.id,
    name: deliveryConfig.npc.name,
    profession: deliveryConfig.npc.profession,
    model: deliveryConfig.npc.model,
    position: deliveryConfig.npc.position,
    heading: deliveryConfig.npc.heading,
    colshapeRadius: deliveryConfig.npc.colshapeRadius,
    scenario: deliveryConfig.npc.scenario,
    blip: deliveryConfig.blip,

    startNode: "start",

    nodes: {
      start: {
        message:
          "Я менеджер службы доставки. Здесь можно устроиться на работу, арендовать транспорт и узнать правила маршрутов.",

        actions: [
          {
            id: "joinDelivery",
            label: "Устроиться доставщиком",
            action: "deliveryJoin",
            next: "after_join",
          },
          {
            id: "rentDelivery",
            label: "Арендовать транспорт",
            next: "rent",
          },
          {
            id: "howWork",
            label: "Как работает доставка?",
            next: "how_work",
          },
          {
            id: "leaveDelivery",
            label: "Уволиться с работы",
            action: "deliveryLeave",
            next: "after_leave",
          },
        ],
      },

      after_join: {
        message:
          "Вы устроились доставщиком. Теперь нужно взять рабочий транспорт. После аренды вам будут доступны маршруты доставки.",

        actions: [
          {
            id: "rentDelivery",
            label: "Перейти к аренде транспорта",
            next: "rent",
          },
          {
            id: "howWork",
            label: "Сначала объясните правила",
            next: "how_work",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      after_leave: {
        message:
          "Вы уволились с работы доставщика. Если захотите стабильный заработок — возвращайтесь.",

        actions: [
          {
            id: "joinDelivery",
            label: "Устроиться обратно",
            action: "deliveryJoin",
            next: "after_join",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      how_work: {
        message:
          "Сначала арендуйте транспорт, затем получите маршрут. Доставьте груз до точки и вернитесь за следующим заказом. Работа не одноразовая — маршруты можно выполнять снова.",

        actions: [
          {
            id: "rentDelivery",
            label: "Арендовать транспорт",
            next: "rent",
          },
          {
            id: "tips",
            label: "Советы доставщику",
            next: "tips",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      tips: {
        message:
          "Совет: не бросайте транспорт далеко от точки, следите за топливом и не берите слишком дорогую аренду, пока не поймёте маршрут.",

        actions: [
          {
            id: "rentDelivery",
            label: "Перейти к аренде",
            next: "rent",
          },
          {
            id: "back",
            label: "Назад",
            next: "how_work",
          },
        ],
      },

      rent: {
        message:
          "Выберите рабочий транспорт. Для старта лучше брать недорогой вариант, чтобы быстрее выйти в плюс.",

        actions: [
          ...deliveryConfig.vehicles.map((vehicle) => ({
            id: `rent_delivery_${vehicle.id}`,
            label: `${vehicle.name} — $${vehicle.rentPrice}`,
            action: `deliveryRent:${vehicle.id}`,
            next: "after_rent",
          })),
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },

      after_rent: {
        message:
          "Транспорт арендован. Теперь получите маршрут и выполните доставку. После завершения можно взять следующий заказ.",

        actions: [
          {
            id: "tips",
            label: "Советы по маршрутам",
            next: "tips",
          },
          {
            id: "back",
            label: "В начало",
            next: "start",
          },
        ],
      },
    },
  },
  {
    id: AUTO_SERVICE.npcId,
    name: AUTO_SERVICE.npc.name,
    profession: AUTO_SERVICE.npc.profession,
    model: AUTO_SERVICE.npc.model,
    scenario: AUTO_SERVICE.npc.scenario,
    position: new mp.Vector3(
      AUTO_SERVICE.npc.position.x,
      AUTO_SERVICE.npc.position.y,
      AUTO_SERVICE.npc.position.z
    ),
    heading: AUTO_SERVICE.npc.heading,
    colshapeRadius: AUTO_SERVICE.interactionRange - 1.5,
    blip: AUTO_SERVICE.npc.blip,
    nodes: {
      start: {
        message: `Я могу доставить сюда любой ваш личный транспорт за $${AUTO_SERVICE.fee} наличными. В машине не должно быть людей, а место выдачи должно быть свободно.`,
        actions: [
          {
            id: "open_vehicle_service",
            label: `Открыть автосервис — $${AUTO_SERVICE.fee}`,
            action: "autoServiceOpen",
          },
          { id: "exit", label: "Уйти", close: true },
        ],
      },
    },
  },
  {
    id: STARTER_VEHICLE_DEALERSHIP.npcId,
    name: "Evan Brooks",
    profession: "Продавец стартовых автомобилей",
    model: "s_m_m_autoshop_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: new mp.Vector3(-45.23, -1097.39, 26.42),
    heading: 68.0,
    colshapeRadius: 5,
    blip: { sprite: 225, color: 3, scale: 0.75, name: "Стартовые автомобили" },
    nodes: {
      start: {
        message:
          "Я продаю недорогие автомобили для дорожной карты новичка. Получите стартовый бюджет и выберите подходящую машину.",
        actions: [
          ...STARTER_VEHICLE_DEALERSHIP.vehicles.map((vehicle) => ({
            id: `starter_buy_${vehicle.id}`,
            label: `${vehicle.name} — $${vehicle.price}`,
            action: `starterVehicleBuy:${vehicle.id}`,
          })),
          {
            id: "exit",
            label: "Уйти",
            close: true,
          },
        ],
      },
    },
  },
  {
    id: STARTER_VEHICLE_DEALERSHIP.garageNpcId,
    name: "Mia Parker",
    profession: "Сотрудник стартового гаража",
    model: "s_f_y_cop_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: new mp.Vector3(-38.77, -1115.84, 26.44),
    heading: 71.0,
    colshapeRadius: 5,
    blip: { sprite: 357, color: 3, scale: 0.75, name: "Стартовый гараж" },
    nodes: {
      start: {
        message:
          "Припаркуйте здесь стартовый автомобиль, купленный во время дорожной карты новичка. Машина должна принадлежать вам, а вы должны находиться за рулём.",
        actions: [
          {
            id: "store_starter_vehicle",
            label: "Поставить стартовый автомобиль в гараж",
            action: "starterVehicleStore",
          },
          {
            id: "exit",
            label: "Уйти",
            close: true,
          },
        ],
      },
    },
  },
  {
    id: "hunting_seller",
    name: "Jeremy Meadows",
    profession: "Охотник-торговец",
    model: "s_m_m_ammucountry",
    scenario: "WORLD_HUMAN_DRINKING_FACILITY",

    position: new mp.Vector3(-674.157, 5838.050, 17.340),
    heading: 134.640,

    // Блип оленя, фиолетовый
    blip: {
      sprite: 442,   // животное / охотничья точка
      color: 5,      // фиолетовый
      scale: 0.8,
      name: "Охотничий магазин"
    },

    nodes: {
      start: {
        message:
          "Добро пожаловать. Здесь можно начать охоту, получить задание, купить снаряжение и продать свежую добычу.",

        actions: [
          {
            id: "get_quest",
            label: "Получить задание",
            action: "huntingGetQuest",
            onlyIf: "huntingInactive"
          },
          {
            id: "submit_quest",
            label: "Сдать задание",
            action: "huntingSubmitQuest",
            onlyIf: "huntingHasQuest"
          },
          {
            id: "start_free_hunt",
            label: "Начать свободную охоту",
            action: "huntingStartFree",
            onlyIf: "huntingInactive"
          },
          {
            id: "finish_hunt",
            label: "Закончить охоту",
            action: "huntingFinish",
            onlyIf: "huntingActive"
          },
          {
            id: "sell",
            label: "Продать свежую тушу",
            action: "huntingSell"
          },
          {
            id: "buy",
            label: "Открыть охотничий магазин",
            action: "openHuntingShop"
          },
          {
            id: "info",
            label: "Как работает охота?",
            action: "huntingInfo"
          }
        ]
      },

      buy: {
        message: "Для охоты понадобятся ружьё, патроны и нож. Для каждой туши также нужны одна верёвка и один мешок.",
        actions: [
          {
            id: "buy_hunting_rifle",
            label: "Охотничье ружьё — $1500",
            action: "huntingBuy:hunting_rifle:1",
            next: "buy"
          },
          {
            id: "buy_hunting_ammo",
            label: "10 патронов — $250",
            action: "huntingBuy:hunting_ammo:10",
            next: "buy"
          },
          {
            id: "buy_hunting_knife",
            label: "Охотничий нож — $350",
            action: "huntingBuy:hunting_knife:1",
            next: "buy"
          },
          {
            id: "buy_hunting_rope",
            label: "Верёвка — $120",
            action: "huntingBuy:hunting_rope:1",
            next: "buy"
          },
          {
            id: "buy_hunting_bag",
            label: "Мешок для туши — $100",
            action: "huntingBuy:hunting_bag:1",
            next: "buy"
          },
          {
            id: "back",
            label: "Назад",
            next: "start"
          }
        ]
      },

      get_quest: { message: "Задание выдаётся через главное меню.", actions: [{ id: "back", label: "Назад", next: "start" }] },
      sell: { message: "Свежая туша продаётся через главное меню.", actions: [{ id: "back", label: "Назад", next: "start" }] }
    }
  },
  {
    id: "buyer_70",
    name: "Cole Mercer",
    profession: "Скупщик товаров · 70%",
    model: "a_m_m_hillbilly_01",
    scenario: "WORLD_HUMAN_SMOKING",
    position: new mp.Vector3(-2180.566, 4269.719, 49.109),
    heading: -126.09,
    huntingPriceCoefficient: 0.7,
    blip: { sprite: 431, color: 5, scale: 0.65, name: "Скупщик" },
    nodes: {
      start: {
        message: "Беру свежие мешки с тушами и свежую рыбу. Плачу 70% базовой цены.",
        actions: [
          { id: "sell_hunting", label: "Продать свежую тушу", action: "huntingSell" },
          { id: "sell_fishing", label: "Продать свежую рыбу", action: "fishingSell" },
          { id: "exit", label: "Уйти", close: true }
        ]
      }
    }
  },
  {
    id: "fishing_seller",
    name: "Noah Rivers",
    profession: "Рыбак-торговец",
    model: "s_m_y_dockwork_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: new mp.Vector3(-1818.9, -1216.42, 13.02),
    heading: 139.0,
    colshapeRadius: 5,
    fishingPriceCoefficient: 1,
    blip: { sprite: 68, color: 38, scale: 0.8, name: "Магазин рыбака" },
    nodes: {
      start: {
        message:
          "Добро пожаловать. Здесь можно начать рыбалку, взять задание, купить снасти, продать свежий улов и посмотреть журнал рыбака.",
        actions: [
          {
            id: "get_quest",
            label: "Получить рыболовное задание",
            action: "fishingGetQuest",
            onlyIf: "fishingNoQuest",
          },
          {
            id: "submit_quest",
            label: "Сдать рыболовное задание",
            action: "fishingSubmitQuest",
            onlyIf: "fishingHasQuest",
          },
          {
            id: "start_free",
            label: "Начать свободную рыбалку",
            action: "fishingStartFree",
            onlyIf: "fishingInactive",
          },
          {
            id: "finish",
            label: "Закончить рыбалку",
            action: "fishingFinish",
            onlyIf: "fishingActive",
          },
          {
            id: "sell",
            label: "Продать свежую рыбу",
            action: "fishingSell",
          },
          {
            id: "sell_all",
            label: "Продать весь улов",
            action: "fishingSellAll",
          },
          {
            id: "shop",
            label: "Открыть магазин рыбака",
            action: "openFishingShop",
          },
          {
            id: "stats",
            label: "Журнал и рекорды",
            action: "fishingStats",
          },
          {
            id: "info",
            label: "Как работает рыбалка?",
            action: "fishingInfo",
          },
        ],
      },
    },
  },
  {
    id: "buyer_90",
    name: "Silas Reed",
    profession: "Скупщик товаров · 90%",
    model: "a_m_m_farmer_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: new mp.Vector3(-360.571, 6060.216, 31.5),
    heading: 47.0,
    huntingPriceCoefficient: 0.9,
    blip: { sprite: 431, color: 5, scale: 0.65, name: "Скупщик" },
    nodes: {
      start: {
        message: "Свежая добыча нужна всегда. Беру туши и рыбу, мой коэффициент — 90%.",
        actions: [
          { id: "sell_hunting", label: "Продать свежую тушу", action: "huntingSell" },
          { id: "sell_fishing", label: "Продать свежую рыбу", action: "fishingSell" },
          { id: "exit", label: "Уйти", close: true }
        ]
      }
    }
  },
  {
    id: "medical_clerk_pillbox",
    name: "Emily Carter",
    profession: "Регистратор EMS",
    model: "s_f_y_scrubs_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",
    position: new mp.Vector3(307.2, -595.4, 43.3),
    heading: 70.0,
    colshapeRadius: 4,
    nodes: {
      start: {
        message:
          "Здесь проводится базовый медицинский осмотр. Пройдите все этапы, чтобы получить физическое свидетельство в инвентарь.",
        actions: [
          {
            id: "screening_start",
            label: "Начать медицинский осмотр",
            next: "screening_physical",
          },
          {
            id: "exit",
            label: "Уйти",
            close: true,
          },
        ],
      },
      screening_physical: {
        message:
          "Этап 1 из 2. Подтвердите, что сейчас вы не находитесь без сознания и способны пройти базовую физическую проверку.",
        actions: [
          {
            id: "screening_physical_confirm",
            label: "Пройти физическую проверку",
            next: "screening_mental",
          },
          {
            id: "screening_cancel",
            label: "Отменить осмотр",
            next: "start",
          },
        ],
      },
      screening_mental: {
        message:
          "Этап 2 из 2. Сотрудник проверил ориентацию и общее психическое состояние персонажа.",
        actions: [
          {
            id: "screening_complete",
            label: "Завершить осмотр",
            action: "completeMedicalScreening",
            next: "screening_done",
          },
          {
            id: "screening_cancel",
            label: "Отменить осмотр",
            next: "start",
          },
        ],
      },
      screening_done: {
        message:
          "Осмотр завершён. Медицинское свидетельство находится в инвентаре и доступно через меню взаимодействия.",
        actions: [
          {
            id: "screening_restart",
            label: "Пройти повторный осмотр",
            next: "screening_physical",
          },
          {
            id: "exit",
            label: "Уйти",
            close: true,
          },
        ],
      },
    },
  },
  {
    id: "license_vendor_airport",
    name: "Marcus Reed",
    profession: "Отдел лицензирования",
    model: "s_m_m_highsec_01",
    scenario: "WORLD_HUMAN_CLIPBOARD",

    position: new mp.Vector3(-1051, -2713, 20),
    heading: 320.0,
    colshapeRadius: 4,

    blip: {
      sprite: 408,
      color: 27,
      scale: 0.75,
      name: "Лицензии",
    },

    startNode: "start",

    nodes: {
      start: {
        message:
          "Здравствуйте. Здесь можно оформить лицензии на охоту и рыбалку. Выберите нужный документ — он будет привязан к персонажу и добавлен в инвентарь.",

        actions: [
          {
            id: "licenses",
            label: "Лицензии",
            next: "licenses",
          },
        ],
      },

      licenses: {
        message:
          "Выберите лицензию. Если действующая лицензия уже есть, отдел восстановит её физический документ только когда он отсутствует в инвентаре.",

        actions: [
          {
            id: "issue_hunting",
            label: "Оформить охотничью лицензию",
            action: "licenseVendorIssue:hunting",
            next: "licenses",
          },
          {
            id: "issue_fishing",
            label: "Оформить рыболовную лицензию",
            action: "licenseVendorIssue:fishing",
            next: "licenses",
          },
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },
    },
  },
  {
    id: miningConfig.npc.id,
    name: miningConfig.npc.name,
    profession: miningConfig.npc.profession,
    model: miningConfig.npc.model,
    position: miningConfig.npc.position,
    heading: miningConfig.npc.heading,
    colshapeRadius: miningConfig.npc.colshapeRadius,
    scenario: miningConfig.npc.scenario,
    blip: miningConfig.blip,
    startNode: "start",
    nodes: {
      start: {
        message:
          "Добро пожаловать в карьер. Для начала смены нужна только ID-карта. Камни общие: мини-игра определяет вашу долю, после чего тачку нужно довезти до сбыта. С 6-го уровня и с CDL открываются циклические угольные рейсы.",
        actions: [
          { id: "join", label: "Начать смену шахтёра", action: "miningJoin", next: "after_join", onlyIf: "miningInactive" },
          { id: "shop", label: "Аренда и снаряжение", action: "miningShopOpen", onlyIf: "miningActive" },
          { id: "rules", label: "Как работает карьер?", next: "rules" },
          { id: "leave", label: "Завершить смену", action: "miningLeave", next: "after_leave", onlyIf: "miningActive" },
        ],
      },
      after_join: {
        message:
          "Смена началась. Вам выданы базовая кирка, каска и форма. Подойдите к камню и нажмите E. GPS-перехватчик покажет все активные камни, а арендованные таймеры замораживаются после выхода из игры.",
        actions: [
          { id: "shop", label: "Открыть меню снаряжения", action: "miningShopOpen", onlyIf: "miningActive" },
          { id: "rules", label: "Правила добычи", next: "rules" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      rules: {
        message:
          "Камень имеет общее HP. Каждый ввод проверяет сервер; ошибки уменьшают итоговые килограммы, но реально участвовавший шахтёр получает долю. Один игрок получает весь камень. Не прыгайте с тачкой — груз рассыплется. С 6-го уровня арендуйте Mule или тягач, загрузитесь у сбыта, отвезите уголь на случайный склад и возвращайтесь за новым рейсом.",
        actions: [
          { id: "shop", label: "Аренда и покупки", action: "miningShopOpen", onlyIf: "miningActive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      after_leave: {
        message: "Смена завершена. Остаток времени аренды и стимулятора сохранён и остановлен.",
        actions: [
          { id: "join", label: "Начать новую смену", action: "miningJoin", next: "after_join", onlyIf: "miningInactive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
    },
  },
  {
    id: forestryConfig.npc.id,
    name: forestryConfig.npc.name,
    profession: forestryConfig.npc.profession,
    model: forestryConfig.npc.model,
    position: forestryConfig.npc.position,
    heading: forestryConfig.npc.heading,
    colshapeRadius: forestryConfig.npc.colshapeRadius,
    scenario: forestryConfig.npc.scenario,
    blip: forestryConfig.blip,
    startNode: "start",
    nodes: {
      start: {
        message: "Добро пожаловать на лесопилку. Для смены нужна ID-карта. Деревья персональны: чужая рубка не забирает вашу точку, а срубленная вами восстановится через 12 минут. Трижды попадите бегунком в зелёную зону, затем пешком отнесите брёвна к разгрузке.",
        actions: [
          { id: "join", label: "Начать смену лесоруба", action: "forestryJoin", onlyIf: "forestryInactive" },
          { id: "shop", label: "Открыть магазин", action: "forestryShopOpen", onlyIf: "forestryActive" },
          { id: "vehicle", label: "Аренда рабочего ТС", action: "forestryVehicleOpen", onlyIf: "forestryActive" },
          { id: "rules", label: "Как работать?", next: "rules" },
          { id: "leave", label: "Завершить смену", action: "forestryLeave", next: "after_leave", onlyIf: "forestryActive" },
        ],
      },
      after_join: {
        message: "Смена началась, рабочая форма выдана. Откройте магазин и арендуйте бензопилу. Все доступные деревья отмечены зелёными блипами, а маршрут к разгрузке появится после сруба.",
        actions: [
          { id: "shop", label: "Открыть магазин", action: "forestryShopOpen", onlyIf: "forestryActive" },
          { id: "rules", label: "Правила лесопилки", next: "rules" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      rules: {
        message: "Подойдите к блипу дерева и нажмите E. Сделайте три точных пропила; скорость бегунка может внезапно вырасти. После сруба несите брёвна пешком: именно прыжок уничтожает груз. Быстрая честная доставка даёт до 15%. С 3 уровня доступен золотой топор x2, с 5 — стимулятор x2 на 5 минут, с 6 и CDL — лесовозы. После 1000 срубленных деревьев выдаётся секретная пила x3.",
        actions: [
          { id: "shop", label: "Магазин и аренда", action: "forestryShopOpen", onlyIf: "forestryActive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      after_leave: {
        message: "Смена завершена. Форма снята; таймеры аренды и стимулятора остановлены до следующей смены.",
        actions: [
          { id: "join", label: "Начать новую смену", action: "forestryJoin", onlyIf: "forestryInactive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
    },
  },
  ...Object.values(cargoLoaderConfig.sites).map((site) => ({
    id: site.npc.id,
    name: site.npc.name,
    profession: site.npc.profession,
    model: site.npc.model,
    position: site.npc.position,
    heading: site.npc.heading,
    colshapeRadius: site.npc.colshapeRadius,
    scenario: site.npc.scenario,
    blip: site.blip,
    startNode: "start",
    nodes: {
      start: {
        message: site.id === "port"
          ? "В порту коробки перемещают между всеми грузовыми площадками. Маршрут выдаёт сервер, а оплата зависит от пройденного расстояния. После разгрузки следующая коробка будет ждать на этой же площадке."
          : "На участке нужно переносить деревянный брус от склада к зоне разгрузки. За каждый полный пеший рейс выплачивается $110.",
        actions: [
          { id: "join", label: `Начать смену · ${site.name}`, action: `cargoLoaderJoin:${site.id}`, next: "after_join", onlyIf: "cargoLoaderInactive" },
          { id: "rules", label: "Правила переноски", next: "rules" },
          { id: "leave", label: "Завершить смену", action: "cargoLoaderLeave", next: "after_leave", onlyIf: "cargoLoaderActive" },
        ],
      },
      rules: {
        message: "Следуйте к отмеченному блипу и нажмите E. Груз можно нести только пешком. При прыжке он упадёт рядом и его придётся поднять снова. Резкое перемещение или транспорт аннулируют текущий груз без выплаты.",
        actions: [
          { id: "join", label: "Начать смену", action: `cargoLoaderJoin:${site.id}`, next: "after_join", onlyIf: "cargoLoaderInactive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      after_join: {
        message: "Смена началась. Рабочая форма выдана, точка погрузки отмечена на карте.",
        actions: [
          { id: "rules", label: "Напомнить правила", next: "rules" },
          { id: "close", label: "Приступить к работе", close: true },
        ],
      },
      after_leave: {
        message: "Смена завершена. Рабочая форма возвращена.",
        actions: [
          { id: "join", label: "Начать новую смену", action: `cargoLoaderJoin:${site.id}`, next: "after_join", onlyIf: "cargoLoaderInactive" },
          { id: "close", label: "Закрыть", close: true },
        ],
      },
    },
  })),
  {
    id: armoredCollectorConfig.npc.id,
    name: armoredCollectorConfig.npc.name,
    profession: "Диспетчер службы инкассации",
    model: armoredCollectorConfig.npc.model,
    position: armoredCollectorConfig.npc.position,
    heading: armoredCollectorConfig.npc.heading,
    colshapeRadius: armoredCollectorConfig.npc.colshapeRadius,
    scenario: armoredCollectorConfig.npc.scenario,
    blip: armoredCollectorConfig.blip,
    startNode: "start",
    nodes: {
      start: {
        message:
          "Служба Gruppe 6 набирает водителей-инкассаторов. Для смены нужны действующая ID-карта и физические права CDL B либо CDL A. После старта вы получите форму, служебный Stockade и приложение с маршрутами, которые обновляются каждые 5 минут.",
        actions: [
          { id: "join", label: "Начать смену инкассатора", action: "armoredCollectorJoin", onlyIf: "armoredCollectorInactive" },
          { id: "rules", label: "Как проходит смена?", next: "rules" },
          { id: "leave", label: "Завершить смену", action: "armoredCollectorLeave", next: "after_leave", onlyIf: "armoredCollectorActive" },
        ],
      },
      rules: {
        message:
          "Выберите маршрут в приложении на базе, доедьте до точки и перенесите все мешки в свой фургон. Затем доставьте груз в хранилище Gruppe 6. Сервер проверяет координаты, транспорт, время и последовательность действий. Если вы непрерывно находитесь вне своего фургона больше 5 минут, смена завершится.",
        actions: [
          { id: "join", label: "Начать смену", action: "armoredCollectorJoin", onlyIf: "armoredCollectorInactive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      after_leave: {
        message: "Смена завершена, форма и служебный фургон возвращены.",
        actions: [
          { id: "join", label: "Начать новую смену", action: "armoredCollectorJoin", onlyIf: "armoredCollectorInactive" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
    },
  },
  {
    id: truckerConfig.npc.id,
    name: truckerConfig.npc.name,
    profession: truckerConfig.npc.profession,
    model: truckerConfig.npc.model,
    position: truckerConfig.npc.position,
    heading: truckerConfig.npc.heading,
    colshapeRadius: truckerConfig.npc.colshapeRadius,
    scenario: truckerConfig.npc.scenario,
    blip: truckerConfig.blip,
    startNode: "start",
    nodes: {
      start: {
        message:
          "Добро пожаловать в Cross-State Logistics. Здесь открывают смену и арендуют рабочий транспорт. Для выхода на линию нужны ID-карта и действующие CDL B либо CDL A, которые оформляет инструктор автошколы. После начала смены в планшете появится приложение с заказами, GPS и деревом навыков.",
        actions: [
          { id: "join", label: "Начать смену дальнобойщика", action: "truckerJoin", next: "after_join" },
          { id: "rent", label: "Арендовать транспорт", action: "truckerRentalOpen" },
          { id: "rules", label: "Объясните правила", next: "rules" },
          { id: "leave", label: "Завершить смену", action: "truckerLeave", next: "after_leave" },
        ],
      },
      after_join: {
        message:
          "Смена открыта: приложение Cross-State появилось в планшете. Выберите ниже класс транспорта, арендуйте машину, сядьте за руль и примите подходящий по весу, рангу и лицензии заказ. После принятия GPS автоматически построит путь к погрузке.",
        actions: [
          { id: "rent", label: "Открыть меню аренды", action: "truckerRentalOpen" },
          { id: "rules", label: "Правила заказов", next: "rules" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      after_leave: {
        message: "Смена завершена, рабочий транспорт возвращён, приложение удалено из планшета.",
        actions: [
          { id: "join", label: "Начать новую смену", action: "truckerJoin", next: "after_join" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
      rules: {
        message:
          "Заказ проверяет тип машины, массу, ранг, навык, CDL и наличие прицепа. После принятия постоянный GPS ведёт сначала на погрузку, затем на разгрузку; кнопку «GPS» можно использовать для восстановления маршрута. Красная зона означает неверную позицию, зелёная — готовность. Погрузка и разгрузка запускаются E; пикап удерживайте точно одну секунду. Отмена и выход во время заказа списывают серверный штраф и один рейс аренды.",
        actions: [
          { id: "rent", label: "Открыть меню аренды", action: "truckerRentalOpen" },
          { id: "back", label: "Назад", next: "start" },
        ],
      },
    },
  },
];

function normalizeNpcDialog(rawNpc) {
  return {
    ...DEFAULT_NPC_DIALOG,
    ...rawNpc,

    blip: {
      ...DEFAULT_NPC_DIALOG.blip,
      ...(rawNpc.blip || {}),
    },
  };
}

const FACTION_DIALOG_META = {
  state: {
    profession: "Рекрутер госструктуры",
    model: "s_m_m_highsec_01",
    blipSprite: 60,
    blipColor: 3,
    joinText:
      "Вступление проходит через набор, собеседование и приглашение от руководства. Следите за объявлениями фракции и подготовьте документы персонажа.",
  },
  ghetto: {
    profession: "Представитель района",
    model: "g_m_y_famca_01",
    blipSprite: 84,
    blipColor: 1,
    joinText:
      "Криминальные организации принимают через RP-знакомство и приглашение старших участников. Репутация персонажа здесь решает больше анкеты.",
  },
  mafia: {
    profession: "Представитель организации",
    model: "g_m_m_chigoon_02",
    blipSprite: 310,
    blipColor: 40,
    joinText:
      "Закрытые организации принимают через RP-контакт, доверие и приглашение руководства. Начните с общения и небольших поручений.",
  },
  adm: {
    profession: "Куратор",
    model: "a_m_y_business_01",
    blipSprite: 408,
    blipColor: 0,
    joinText:
      "Эта организация доступна по назначению администрации.",
  },
};

const FACTION_TYPE_LABELS = Object.freeze({
  state: "государственная организация",
  ghetto: "уличная группировка",
  mafia: "криминальная организация",
  adm: "административная организация",
});

function createFactoryFactionDialog(faction) {
  const spawn = faction.spawn || {};
  const meta = FACTION_DIALOG_META[faction.type] || FACTION_DIALOG_META.state;
  const factionTypeLabel = FACTION_TYPE_LABELS[faction.type] || "организация";
  const position = new mp.Vector3(Number(spawn.x || 0), Number(spawn.y || 0), Number(spawn.z || 0));
  const ranksCount = Array.isArray(faction.ranks) ? faction.ranks.length : 0;
  const departments = Array.isArray(faction.departments) ? faction.departments : [];
  const departmentsText = departments.length
    ? departments.map((item) => `${item.code}: ${item.name}`).join("; ")
    : "Отделы пока не настроены.";

  return normalizeNpcDialog({
    id: `factory_faction_${faction.fractionId}`,
    name: faction.shortName || faction.name,
    profession: meta.profession,
    model: faction.npc?.model || meta.model,
    scenario: faction.npc?.scenario || "WORLD_HUMAN_CLIPBOARD",
    position,
    heading: Number(spawn.heading || faction.npc?.heading || 0),
    colshapeRadius: Number(faction.npc?.colshapeRadius || 5),
    blip: {
      sprite: Number(faction.blip?.sprite || meta.blipSprite),
      color: Number(faction.blip?.color || meta.blipColor),
      scale: Number(faction.blip?.scale || 0.75),
      name: faction.shortName || faction.name,
    },
    startNode: "start",
    nodes: {
      start: {
        message: `${faction.name}. Здесь можно узнать про структуру организации, отделы и путь вступления.`,
        actions: [
          {
            id: "about",
            label: "О фракции",
            next: "about",
          },
          {
            id: "departments",
            label: "Отделы",
            next: "departments",
          },
          {
            id: "join",
            label: "Как вступить",
            next: "join",
          },
        ],
      },
      about: {
        message:
          `Тип организации: ${factionTypeLabel}. Рангов: ${ranksCount}. ` +
          `Лимит состава: ${Number(faction.settings?.memberSlots || 0)}. ` +
          "После вступления доступны фракционный чат, отделы, ранги и планшет управления.",
        actions: [
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },
      departments: {
        message: departmentsText,
        actions: [
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
        ],
      },
      join: {
        message: meta.joinText,
        actions: [
          {
            id: "back",
            label: "Назад",
            next: "start",
          },
          {
            id: "close",
            label: "Закрыть",
            close: true,
          },
        ],
      },
    },
  });
}

const FACTORY_FACTION_DIALOGS = (systemFactory.factions || [])
  .filter((faction) => faction.enabled !== false && faction.spawn)
  .map(createFactoryFactionDialog);

module.exports = [
  ...NPC_DIALOGS.map(normalizeNpcDialog),
  ...FACTORY_FACTION_DIALOGS,
];
