<template>
  <div class="creator-app">
    <div v-if="!isNameStep" class="creator">
      <TwinkleGridPicker
        v-if="activePickerConfig"
        class="creator-picker-panel"
        :model-value="activePickerValue"
        :options="activePickerConfig.options"
        :title="activePickerConfig.title"
        @update:model-value="setActivePickerValue"
        @back="cancelPicker"
        @done="confirmPicker"
      />

      <div class="creator__container" :class="{ 'creator__container--blocked': activePickerConfig }">

        <h2 class="creator__title">{{ activeTabLabel }}</h2>

        <div class="creator__tabs">
          <button
            class="tab tab--genetic"
            :class="{ 'tab--active': activeTab === 'genetic' }"
            type="button"
            @click="setActiveTab('genetic')"
          ><svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.36 0V1H11.1415L9.454 2.703C8.85086 2.24749 8.11582 2.00072 7.36 2C6.425 2 5.552 2.37 4.891 3.0315C4.56427 3.35429 4.30487 3.73873 4.12784 4.16253C3.95081 4.58634 3.85968 5.04106 3.85973 5.50035C3.85977 5.95964 3.951 6.41435 4.12811 6.83812C4.30523 7.26189 4.5647 7.64628 4.8915 7.969C5.3265 8.404 5.8445 8.7165 6.4225 8.875C6.4795 8.8315 6.5435 8.786 6.5945 8.735C6.80408 8.52184 6.95466 8.25788 7.0315 7.969C6.48709 7.90203 5.98091 7.6543 5.594 7.2655C5.122 6.794 4.86 6.168 4.86 5.5C4.86 4.832 5.1225 4.207 5.595 3.735C6.066 3.2615 6.692 3 7.36 3C8.028 3 8.6535 3.2625 9.125 3.735C9.35821 3.96593 9.54326 4.24085 9.66942 4.54382C9.79559 4.8468 9.86037 5.1718 9.86 5.5C9.86 5.9325 9.7375 6.335 9.532 6.703C9.58 6.961 9.61 7.232 9.61 7.5C9.61 7.74967 9.58917 7.99467 9.5475 8.235C9.6475 8.1535 9.7365 8.061 9.829 7.969C10.49 7.307 10.86 6.435 10.86 5.5C10.86 4.735 10.608 4.008 10.157 3.406L11.86 1.719V3.5H12.86V0H9.36ZM6.2975 4.125C6.2405 4.1685 6.1765 4.214 6.1255 4.265C5.9095 4.482 5.7685 4.745 5.6885 5.0315C6.2335 5.1015 6.731 5.3395 7.126 5.7345C7.5985 6.206 7.861 6.832 7.861 7.4995C7.861 8.167 7.5985 8.7925 7.126 9.2645C6.654 9.7385 6.028 10 5.36 10C4.692 10 4.0665 9.7375 3.595 9.265C3.36157 9.03424 3.17637 8.75935 3.05019 8.45634C2.924 8.15332 2.85935 7.82824 2.86 7.5C2.86 7.0675 2.9825 6.665 3.188 6.297C3.13837 6.03418 3.11226 5.76746 3.11 5.5C3.11 5.25067 3.13083 5.00567 3.1725 4.765C3.0725 4.8465 2.984 4.939 2.891 5.0315C2.231 5.692 1.86 6.565 1.86 7.5C1.86 8.265 2.112 8.992 2.563 9.594L1.72 10.4375L0.72 9.4375L0 10.1405L1 11.1405L0 12.1405L0.72 12.8605L1.72 11.8605L2.72 12.8605L3.4225 12.1405L2.4225 11.1405L3.2665 10.2975C3.86905 10.7537 4.60423 11.0004 5.36 11C6.295 11 7.168 10.63 7.829 9.9685C8.49 9.308 8.86 8.435 8.86 7.5C8.86 6.565 8.49 5.693 7.8285 5.031C7.3935 4.596 6.8755 4.2835 6.2975 4.125Z" fill="white"/>
          </svg>
          </button>
          <button
            class="tab tab--face"
            :class="{ 'tab--active': activeTab === 'face' }"
            type="button"
            @click="setActiveTab('face')"
          ><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.66667 8.75C4.39444 8.75 4.16422 8.65589 3.976 8.46767C3.78778 8.27944 3.69392 8.04948 3.69444 7.77778C3.69496 7.50607 3.78907 7.27585 3.97678 7.08711C4.16448 6.89837 4.39444 6.80452 4.66667 6.80556C4.93889 6.80659 5.16911 6.9007 5.35733 7.08789C5.54555 7.27507 5.63941 7.50504 5.63889 7.77778C5.63837 8.05052 5.54426 8.28074 5.35655 8.46844C5.16885 8.65615 4.93889 8.75 4.66667 8.75ZM9.33333 8.75C9.06111 8.75 8.83089 8.65589 8.64266 8.46767C8.45444 8.27944 8.36059 8.04948 8.36111 7.77778C8.36163 7.50607 8.45574 7.27585 8.64344 7.08711C8.83115 6.89837 9.06111 6.80452 9.33333 6.80556C9.60555 6.80659 9.83577 6.9007 10.024 7.08789C10.2122 7.27507 10.3061 7.50504 10.3056 7.77778C10.305 8.05052 10.2109 8.28074 10.0232 8.46844C9.83552 8.65615 9.60555 8.75 9.33333 8.75ZM7 13.2222C8.73703 13.2222 10.2083 12.6194 11.4139 11.4139C12.6194 10.2083 13.2222 8.73704 13.2222 7C13.2222 6.68889 13.2028 6.38763 13.1639 6.09622C13.125 5.80482 13.0537 5.52274 12.95 5.25C12.6778 5.31482 12.4056 5.36356 12.1333 5.39622C11.8611 5.42889 11.5759 5.44496 11.2778 5.44444C10.0981 5.44444 8.98333 5.19167 7.93333 4.68611C6.88333 4.18056 5.98889 3.47407 5.25 2.56667C4.83518 3.57778 4.24226 4.45615 3.47122 5.20178C2.70018 5.94741 1.80237 6.50793 0.777778 6.88333V7C0.777778 8.73704 1.38056 10.2083 2.58611 11.4139C3.79167 12.6194 5.26296 13.2222 7 13.2222ZM7.00233 14C6.03426 14 5.12426 13.8164 4.27233 13.4493C3.42041 13.0817 2.67918 12.5831 2.04867 11.9537C1.41815 11.3242 0.919074 10.5835 0.551444 9.73155C0.183815 8.87963 0 7.96989 0 7.00233C0 6.03478 0.183815 5.12478 0.551444 4.27233C0.919074 3.41989 1.41711 2.67867 2.04556 2.04867C2.674 1.41867 3.4147 0.919594 4.26767 0.551446C5.12063 0.183297 6.03063 -0.000517425 6.99766 1.09392e-06C7.9647 0.000519612 8.8747 0.184335 9.72766 0.551446C10.5806 0.918557 11.3218 1.41685 11.9513 2.04633C12.5808 2.67582 13.0799 3.41652 13.4486 4.26845C13.8172 5.12037 14.001 6.03011 14 6.99767C13.999 7.96522 13.8154 8.87522 13.4493 9.72767C13.0833 10.5801 12.5844 11.3213 11.9529 11.9513C11.3213 12.5813 10.5809 13.0804 9.73155 13.4486C8.88222 13.8167 7.97248 14.0005 7.00233 14Z" fill="white"/>
          </svg>
          </button>
          <button
            class="tab tab--hair"
            :class="{ 'tab--active': activeTab === 'hair' }"
            type="button"
            @click="setActiveTab('hair')"
          ><svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.05126 3.97137C5.90048 4.74302 6.31996 4.5553 6.69677 4.8977C6.78302 4.97607 6.83198 5.04997 6.90142 5.20196L7.34255 6.26737C7.39293 6.39427 7.43332 6.50489 7.46372 6.59921L7.49094 6.62395C7.90437 6.37901 8.27083 6.31313 8.70863 6.41551L8.7305 6.39144L8.1399 4.96104C7.95718 4.51445 8.04382 4.36399 8.37104 4.00388C9.20182 3.08961 9.04613 1.61903 8.02878 0.694589C7.01621 -0.225505 5.53815 -0.232029 4.71125 0.677981C3.88771 1.58429 4.03869 3.05127 5.05126 3.97137ZM5.6507 3.31168C5.05588 2.77118 4.97071 1.88861 5.45592 1.35464C5.95223 0.808452 6.83132 0.817297 7.42614 1.3578C8.03926 1.91491 8.12725 2.78518 7.63111 3.33118C7.51502 3.4596 7.37161 3.561 7.20912 3.62955C7.04662 3.6981 6.86825 3.73246 6.68423 3.73065C6.50021 3.72884 6.31418 3.69089 6.13682 3.61899C5.95946 3.54709 5.79426 3.44266 5.6507 3.31168ZM0.868305 8.57474C1.88566 9.49918 3.36455 9.51356 4.19515 8.59948C4.50034 8.26361 4.63993 8.14674 5.03807 8.2648L16.0263 11.61C16.3914 10.8341 15.7469 10.0564 14.2888 9.38895L9.28222 7.10674C8.57934 6.7858 8.13074 6.81388 7.57291 7.12671L7.21395 7.33968C6.95466 7.48807 6.75477 7.49843 6.25336 7.33825L5.24358 7.02643C5.08211 6.97571 5.00388 6.93403 4.91763 6.85565C4.54082 6.51326 4.69116 6.07388 3.84195 5.30222C2.82938 4.38213 1.35485 4.37172 0.535185 5.27376C-0.291885 6.18396 -0.144434 7.65483 0.868136 8.57493M8.32079 8.37484C8.11649 8.1892 8.07535 7.8787 8.24443 7.69262C8.42092 7.4984 8.7304 7.51359 8.9347 7.69923C9.14357 7.88903 9.18824 8.19565 9.01176 8.38987C8.84267 8.57594 8.52966 8.56464 8.32079 8.37484ZM10.1094 13.9884C10.9073 15.4003 11.7488 15.9433 12.501 15.4896L10.3854 10.3912L7.71176 9.56497L7.66768 9.61348L10.1094 13.9884ZM1.47094 7.91154C0.876119 7.37104 0.783547 6.49662 1.27986 5.95043C1.76506 5.41646 2.64803 5.42104 3.24285 5.96154C3.85596 6.51866 3.94026 7.393 3.45505 7.92697C2.95874 8.47316 2.08405 8.46865 1.47094 7.91154Z" fill="white"/>
          </svg>
          </button>
          <button
            class="tab tab--body"
            :class="{ 'tab--active': activeTab === 'body' }"
            type="button"
            @click="setActiveTab('body')"
          ><svg width="9" height="15" viewBox="0 0 9 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.4794 5.25852C2.31633 5.25852 0.262799 6.77004 0.522229 8.85483C0.542983 9.01681 0.567197 9.18774 0.594869 9.36763C0.677887 9.90507 1.15985 10.2969 1.72137 10.2969H2.3613L2.82827 13.114C2.89118 13.5004 3.09402 13.8522 3.4003 14.1063C3.70658 14.3604 4.09618 14.5 4.499 14.5C4.90183 14.5 5.29143 14.3604 5.59771 14.1063C5.90398 13.8522 6.10682 13.5004 6.16973 13.114L6.63555 10.2969H7.2847C7.55416 10.2988 7.81541 10.207 8.02134 10.0383C8.22727 9.8695 8.36431 9.63483 8.40775 9.37659C8.43342 9.21498 8.45648 9.05298 8.47693 8.89066C8.74328 6.7902 6.65861 5.25852 4.4794 5.25852ZM4.50016 4.9786C5.97602 4.9786 6.8062 4.17245 6.8062 2.7393C6.8062 1.30615 5.97602 0.5 4.50016 0.5C3.02429 0.5 2.19411 1.30615 2.19411 2.7393C2.19411 4.17245 3.02429 4.9786 4.50016 4.9786Z" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          </button>
          <button
            class="tab tab--clothes"
            :class="{ 'tab--active': activeTab === 'clothes' }"
            type="button"
            @click="setActiveTab('clothes')"
          ><svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.4 4.4V10.4M10.4 10.4V12.5H2.6V10.4M10.4 10.4H12.5V4.4C12.5 3.5 11.9 2.45 11 1.7C10.1 0.95 8.3 0.5 8.3 0.5H4.7C4.7 0.5 2.9 0.95 2 1.7C1.1 2.45 0.5 3.5 0.5 4.4V10.4H2.6M2.6 10.4V4.4" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8.29995 0.5C8.29995 0.97739 8.11031 1.43523 7.77274 1.77279C7.43518 2.11036 6.97734 2.3 6.49995 2.3C6.02256 2.3 5.56472 2.11036 5.22716 1.77279C4.88959 1.43523 4.69995 0.97739 4.69995 0.5" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          </button>
        </div>

        <div v-if="activeTab === 'genetic'" class="creator__list">

          <div class="item">
            <span class="item__left">Пол персонажа</span>
            <span class="item__right">
              <TwinkleOptionStepper v-model="selections.gender" :options="genderOptions" />
            </span>
          </div>

          <div class="item">
            <span class="item__left">Ген 1</span>
            <span class="item__right">
              <button class="creator-picker-trigger" type="button" @click="openPicker('gen1')">
                {{ getPickerSelectionLabel('gen1') }}
              </button>
            </span>
          </div>

          <div class="item">
            <span class="item__left">Ген 2</span>
            <span class="item__right">
              <button class="creator-picker-trigger" type="button" @click="openPicker('gen2')">
                {{ getPickerSelectionLabel('gen2') }}
              </button>
            </span>
          </div>

          <div class="item">
            <span class="item__left">Схожесть</span>
            <div class="slider">
              <span class="item__right">{{ formatSliderValue(sliders.similarity) }}</span>
              <TwinkleRangeSlider theme="light" v-model="sliders.similarity" />
            </div>
          </div>

          <div class="item">
            <span  class="item__left">Цвет кожи</span>
            <div class="slider">
              <span class="item__right">{{ formatSliderValue(sliders.skinColor) }}</span>
              <TwinkleRangeSlider theme="light" v-model="sliders.skinColor" />
            </div>
          </div>



        </div>

        <div v-if="activeTab === 'face'" class="creator-hair tab--face">
          <div class="creator__list creator-hair">
            <div class="item">
              <span class="item__left">Цвет глаз</span>
              <span class="item__right">
                <TwinkleOptionStepper v-model="selections.eyeColor" :options="numberOptions" />
           </span>
            </div>

            <div class="item">
              <span class="item__left">Глаза</span>
              <span class="item__right">
                <TwinkleOptionStepper v-model="selections.eyeShape" :options="eyeShapeOptions" />
           </span>
            </div>
          </div>

          <div class="creator-hair-width">
            <div class="creator-hair__slider">Узкие</div>

            <TwinkleRangeSlider theme="light" v-model="sliders.hairWidth" />

            <div class="creator-hair-box__label">Широкие</div>
          </div>

          <div class="creator-axis-field">
            <TwinkleAxisField
              v-model="axisFields.faceShape"
              :labels="{
                top: 'Маленький',
                left: 'Узкий',
                right: 'Широкий',
                bottom: 'Длинный',
              }"
              type="plane"
            />
          </div>
        </div>

        <div v-if="activeTab === 'hair'" class="creator-colors tab--hair">
          <div class="creator__list creator-hair">
            <div class="creator-colors__item">
              <span class="creator-colors-item__left">Прическа</span>
              <span class="creator-colors-item__right">
                <button class="creator-picker-trigger" type="button" @click="openPicker('hair')">
                  {{ getPickerSelectionLabel('hair') }}
                </button>
           </span>
            </div>

            <div class="creator-colors__item">
              <span class="creator-colors-item__left">Основной цвет</span>
              <span class="creator-colors-item__right">
                <TwinkleColorPicker v-model="selections.hairPrimaryColor" :colors="colorPalette" />
           </span>
            </div>

          </div>

          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Дополнительный цвет</span>
            <span class="creator-colors-item__right">
              <TwinkleColorPicker v-model="selections.hairSecondaryColor" :colors="colorPalette" />
           </span>
          </div>
          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Брови</span>
            <span class="creator-colors-item__right">
              <button class="creator-picker-trigger" type="button" @click="openPicker('beard')">
                {{ getPickerSelectionLabel('beard') }}
              </button>
           </span>
          </div>


          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Непрозрачность</span>
              <span class="creator-colors-item__right">

              <div class="creator-colors-slider__row">
                <div class="creator-colors-row__value">{{ formatSliderValue(sliders.colorOpacity) }}</div>
                <TwinkleRangeSlider theme="light" v-model="sliders.colorOpacity" />
              </div>

           </span>
          </div>


          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Основной цвет</span>
            <span class="creator-colors-item__right">
              <TwinkleColorPicker v-model="selections.browPrimaryColor" :colors="colorPalette" />
           </span>
          </div>

          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Волосы на груди</span>
            <span class="creator-colors-item__right">
              <TwinkleOptionStepper v-model="selections.bodyHair" :options="numberOptions" />
           </span>
          </div>

          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Непрозрачность</span>
              <span class="creator-colors-item__right">

              <div class="creator-colors-slider__row">
                <div class="creator-colors-row__value">{{ formatSliderValue(sliders.bodyHairOpacity) }}</div>
                <TwinkleRangeSlider theme="light" v-model="sliders.bodyHairOpacity" />
              </div>


           </span>
          </div>

          <div class="creator-colors__item">
            <span class="creator-colors-item__left">Основной цвет</span>
            <span class="creator-colors-item__right">
              <TwinkleColorPicker v-model="selections.bodyHairPrimaryColor" :colors="colorPalette" />
           </span>
          </div>

        </div>

        <div v-if="activeTab === 'body'" class="creator-skin__editor tab--body">
          <div class="creator__list creator-hair">
            <div class="creator-skin-editor__item">
              <span class="creator-skin__editor-item__left">Дефекты лица</span>
              <span class="creator-skin__editor-item__right">
                <TwinkleOptionStepper v-model="selections.faceDefect" :options="presenceOptions" />
           </span>
            </div>

            <div class="creator-skin-editor__item">
              <span class="creator-skin__editor-item__left">Непрозрачность</span>
              <span class="creator-skin__editor-item__right">

                <div class="creator-skin__editor-slider__row">
                  <div class="creator-skin__editor-row__value">{{ formatSliderValue(sliders.faceDefectOpacity) }}</div>
                  <TwinkleRangeSlider theme="light" v-model="sliders.faceDefectOpacity" />
                </div>



           </span>
            </div>

          </div>

          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Дефекты тела</span>
            <span class="creator-skin__editor-item__right">
              <TwinkleOptionStepper v-model="selections.bodyDefect" :options="presenceOptions" />
           </span>
          </div>
          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Непрозрачность</span>
            <span class="creator-skin__editor-item__right">

              <div class="creator-skin__editor-slider__row">
                <div class="creator-skin__editor-row__value">{{ formatSliderValue(sliders.bodyDefectOpacity) }}</div>
                <TwinkleRangeSlider theme="light" v-model="sliders.bodyDefectOpacity" />
              </div>


            </span>
          </div>


          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Старение</span>
            <span class="creator-skin__editor-item__right">
              <TwinkleOptionStepper v-model="selections.aging" :options="presenceOptions" />
           </span>
          </div>


          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Родинки и веснушки</span>
            <span class="creator-skin__editor-item__right">
              <TwinkleOptionStepper v-model="selections.freckles" :options="presenceOptions" />
           </span>
          </div>

          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Макияж</span>
            <span class="creator-skin__editor-item__right">
              <TwinkleOptionStepper v-model="selections.makeup" :options="numberOptions" />
           </span>
          </div>

          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Непрозрачность</span>
            <span class="creator-skin__editor-item__right">

              <div class="creator-skin__editor-slider__row">
                <div class="creator-skin__editor-row__value">{{ formatSliderValue(sliders.ageOpacity) }}</div>
                <TwinkleRangeSlider theme="light" v-model="sliders.ageOpacity" />
              </div>
           </span>
          </div>

          <div class="creator-skin-editor__item">
            <span class="creator-skin__editor-item__left">Повреждение кожи</span>
            <span class="creator-skin__editor-item__right">
              <TwinkleOptionStepper v-model="selections.lipstick" :options="presenceOptions" />
           </span>
          </div>
        </div>

        <div v-if="activeTab === 'clothes'" class="creator-clothes-editor tab--clothes">
          <div class="creator__list creator-hair">
            <div class="creator-clothes-editor__item">
              <span class="creator-clothes-editor-item__left">Вверх</span>
              <span class="creator-clothes-editor-editor-item__right">
                <button class="creator-picker-trigger" type="button" @click="openPicker('top')">
                  {{ getPickerSelectionLabel('top') }}
                </button>
           </span>
            </div>

            <div class="creator-clothes-editor__item">
              <span class="creator-clothes-editor-item__left">Низ</span>
              <span class="creator-clothes-editor-editor-item__right">
                <button class="creator-picker-trigger" type="button" @click="openPicker('bottom')">
                  {{ getPickerSelectionLabel('bottom') }}
                </button>
           </span>
            </div>

            <div class="creator-clothes-editor__item">
              <span class="creator-clothes-editor-item__left">Обувь</span>
              <span class="creator-clothes-editor-editor-item__right">
                <button class="creator-picker-trigger" type="button" @click="openPicker('shoes')">
                  {{ getPickerSelectionLabel('shoes') }}
                </button>
           </span>
            </div>
          </div>
        </div>

        <div class="creator-clothes-editor-actions-btn">
            <button
              v-if="!isFirstTab"
              class="creator-clothes-editor__button"
              type="button"
              @click="goToPreviousTab"
            >Назад</button>
            <button
              class="creator-clothes-editor__button"
              type="button"
              @click="goToNextTab"
            >{{ isLastTab ? 'Готово' : 'Далее' }}</button>
        </div>
      </div>
    </div>
      <div v-if="isNameStep" class="creator-nickname__wrapper">
        <div class="creator-nickname__screen">
          <div class="creator-nickname__screen-field">
            <input
              v-model.trim="characterName.first"
              class="nickname-field__input"
              type="text"
              placeholder="Введите имя..."
            >
            <img class="creator-nickname__screen-icon" src="/cube-icon.png" alt="icon">
          </div>

          <div class="creator-nickname__screen-field">
            <input
              v-model.trim="characterName.last"
              class="nickname-field__input"
              type="text"
              placeholder="Введите фамилию..."
            >
            <img class="creator-nickname__screen-icon" src="/cube-icon.png" alt="icon">
          </div>

          <div class="creator-nickname__screen-field">
            <input
              v-model.trim="characterName.age"
              class="nickname-field__input"
              type="text"
              maxlength="2"
              placeholder="Возраст"
            >
            <img class="creator-nickname__screen-icon" src="/cube-icon.png" alt="icon">
          </div>

          <span class="creator-nickname__screen-text">
            Пожалуйста, ознакомьтесь с правилами именования,
            установленными на сервере, чтобы правильно подобрать никнейм.
          </span>

          <div class="creator-nickname-screen__actions">
            <button
              class="creator-nickname-screen__button"
              type="button"
              @click="isNameStep = false"
            >Назад</button>

            <button
              class="creator-nickname-screen__button"
              type="button"
              @click="saveCharacter"
            >Готово</button>
          </div>
        </div>
      </div>

    <div v-if="false" class="creator-screen__creator-form--name">
      <div class="creator-form">
        <div class="creator-form__panel">
          <div class="creator-screen-form__title">
          <h1 class="creator-form__title">Выбор никнейма</h1>

          <span class="creator-form__text">Выберите имя и фамилию, чтобы начать.<br>
          Для быстрого выбора доступен генератор.</span>
          </div>

          <div class="creator-form__field">
            <label class="creator-form__field__label">
            <input class="nickname-field__input" type="text" placeholder="Введите имя...">
            <img class="creator-form-screen__icon" src="/cube-icon.png" alt="icon">
            </label>


            <div class="creator-form__field">
              <label class="creator-form__field__label">
              <input class="nickname-field__input" type="text" placeholder="Введите имя...">
              <img class="creator-form-screen__icon" src="/cube-icon.png" alt="icon">
              </label>


              <div class="creator-form__field">
                <label class="creator-form__field__label">
                <input class="nickname-field__input" type="text" placeholder="Введите имя...">
                <img class="creator-form-screen__icon" src="/cube-icon.png" alt="icon">
                </label>


              </div>
            </div>

          </div>
          <span class="creator-form__hint">
            Пожалуйста, ознакомьтесь с правилами именования,<br> установленными на сервере, чтобы правильно подобрать<br> никнейм.
          </span>

          <div class="creator-form__actions">
            <button class="creator-form-screen__button" type="button">Назад</button>
            <button class="creator-form-screen__button" type="button">Готово</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="false" class="creator-gen-select">

      <div class="creator-gen-select__field">
        <h1 class="creator-gen-select__title">Выбор ген 1</h1>
        <div class="creator-gen-select__field-item">
        <img src="/2.png" alt="logotype">
        <img src="/icon-3.png" alt="logotype">
        <img src="/icon-4.png" alt="logotype">
        </div>

        <div class="creator-gen-select__field-item">
        <img src="/icon-5.png" alt="logotype">
        <img src="/icon-5.png" alt="logotype">
        <img src="/icon-7.png" alt="logotype">
        </div>
        <div class="creator-gen-select__field-item">
        <img src="/icon-8.png" alt="logotype">
        <img src="/icon-9.png" alt="logotype">
        <img src="/icon-9.png" alt="logotype">
        </div>

      </div>

      <div class="creator-gen-select__actions">
        <button class="creator-gen-select__button" type="button">Назад</button>
        <button class="creator-gen-select__button" type="button">Готово</button>
      </div>


    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import TwinkleAxisField from '@/shared/components/TwinkleAxisField.vue'
import TwinkleColorPicker from '@/shared/components/TwinkleColorPicker.vue'
import TwinkleGridPicker, { type GridPickerKey, type GridPickerOption } from '@/shared/components/TwinkleGridPicker.vue'
import TwinkleOptionStepper from '@/shared/components/TwinkleOptionStepper.vue'
import TwinkleRangeSlider from '@/shared/components/TwinkleRangeSlider.vue'

type StepperOption = {
  label: string
  value: string | number
}

type CreatorTabId = 'genetic' | 'face' | 'hair' | 'body' | 'clothes'
type PickerId = 'beard' | 'bottom' | 'gen1' | 'gen2' | 'hair' | 'shoes' | 'top'
type PickerSelectionKey = 'accessory' | 'bag' | 'brows' | 'gen1' | 'gen2' | 'hair' | 'shoes'

type PickerConfig = {
  options: GridPickerOption[]
  selectionKey: PickerSelectionKey
  title: string
}

type MpBridge = {
  trigger?: (eventName: string, ...args: unknown[]) => void
  events?: {
    call: (eventName: string, ...args: unknown[]) => void
  }
}

const isNameStep = ref(false)

const characterName = reactive({
  first: '',
  last: '',
  age: 18,
})

const MAX_PARENT = 45
const HAIR_LIST_MALE = [0, 1, 2, 3, 4, 5, 6, 7]
const HAIR_LIST_FEMALE = [8, 9, 10, 11, 12, 13]

const CLOTHES_CONFIG = {
  bottom: {
    component: 4,
    items: [
      { drawable: 0, key: 'bottom-1', label: 'Одежда #0', texture: 0 },
      { drawable: 7, key: 'bottom-2', label: 'Одежда #1', texture: 0 },
      { drawable: 19, key: 'bottom-3', label: 'Одежда #2', texture: 0 },
    ],
  },
  shoes: {
    component: 6,
    items: [
      { drawable: 1, key: 'shoes-1', label: 'Одежда #0', texture: 0 },
      { drawable: 4, key: 'shoes-2', label: 'Одежда #1', texture: 0 },
      { drawable: 9, key: 'shoes-3', label: 'Одежда #2', texture: 0 },
    ],
  },
  top: {
    component: 11,
    items: [
      { drawable: 0, key: 'top-1', label: '12', texture: 0 },
      { drawable: 5, key: 'top-2', label: '13', texture: 0 },
      { drawable: 12, key: 'top-3', label: '14', texture: 0 },
    ],
  },
} as const

const FACE_FEATURES = {
  eyesOpen: 11,
  faceShapeX: 10,
  faceShapeY: 15,
} as const

const ccSlot = ref(1);

(window as typeof window & { setCcSlot?: (slot: number | string) => void }).setCcSlot = (slot: number | string) => {
  ccSlot.value = Number(slot) || 1
}

function trig(eventName: string, ...args: unknown[]) {
  const mp = (globalThis as typeof globalThis & { mp?: MpBridge }).mp

  if (mp?.trigger) {
    mp.trigger(eventName, ...args)
    return
  }

  mp?.events?.call(eventName, ...args)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const creatorTabs: Array<{ id: CreatorTabId; label: string }> = [
  { id: 'genetic', label: 'Генетика' },
  { id: 'face', label: 'Лицо' },
  { id: 'hair', label: 'Волосы' },
  { id: 'body', label: 'Тело' },
  { id: 'clothes', label: 'Одежда' },
]

const activeTab = ref<CreatorTabId>('genetic')
const activePicker = ref<PickerId | null>(null)

const activeTabIndex = computed(() => creatorTabs.findIndex((tab) => tab.id === activeTab.value))
const activeTabLabel = computed(() => creatorTabs[activeTabIndex.value]?.label ?? '')
const isFirstTab = computed(() => activeTabIndex.value <= 0)
const isLastTab = computed(() => activeTabIndex.value === creatorTabs.length - 1)
const activePickerConfig = computed(() => (activePicker.value ? pickerConfigs.value[activePicker.value] : null))
const activePickerValue = computed(() => {
  const config = activePickerConfig.value

  return config ? selections[config.selectionKey] : ''
})
const pickerSnapshot = ref<{
  selectionKey: PickerSelectionKey
  value: GridPickerKey
} | null>(null)

function setActiveTab(tabId: CreatorTabId) {
  activeTab.value = tabId
}

function goToPreviousTab() {
  const previousIndex = Math.max(0, activeTabIndex.value - 1)

  activeTab.value = creatorTabs[previousIndex].id
}

function goToNextTab() {
  if (isLastTab.value) {
    isNameStep.value = true
    return
  }

  const nextIndex = Math.min(creatorTabs.length - 1, activeTabIndex.value + 1)

  activeTab.value = creatorTabs[nextIndex].id
}

function openPicker(pickerId: PickerId) {
  const config = pickerConfigs.value[pickerId]

  pickerSnapshot.value = {
    selectionKey: config.selectionKey,
    value: selections[config.selectionKey] as GridPickerKey,
  }

  activePicker.value = pickerId
}

function closePicker() {
  activePicker.value = null
  pickerSnapshot.value = null
}

function confirmPicker() {
  closePicker()
}

function cancelPicker() {
  const snapshot = pickerSnapshot.value

  if (snapshot) {
    ;(selections as Record<PickerSelectionKey, GridPickerKey>)[snapshot.selectionKey] = snapshot.value
  }

  closePicker()
}

function setActivePickerValue(value: GridPickerKey) {
  const config = activePickerConfig.value

  if (!config) {
    return
  }

  ;(selections as Record<PickerSelectionKey, GridPickerKey>)[config.selectionKey] = value
}

function focusCameraForTab(tabId: CreatorTabId) {
  trig('cc:focus', tabId === 'face' || tabId === 'hair' ? 'face' : 'body')
}

const genderOptions: StepperOption[] = [
  { label: 'Мужской', value: 'male' },
  { label: 'Женский', value: 'female' },
]

const numberOptions: StepperOption[] = Array.from({ length: 31 }, (_, index) => ({
  label: String(index).padStart(2, '0'),
  value: index,
}))

const eyeShapeOptions: StepperOption[] = [
  { label: 'Стандартные', value: 'default' },
  { label: 'Узкие', value: 'narrow' },
  { label: 'Широкие', value: 'wide' },
]

const presenceOptions: StepperOption[] = [
  { label: 'Отсутствуют', value: 'none' },
  { label: 'Легкие', value: 'light' },
  { label: 'Средние', value: 'medium' },
  { label: 'Выраженные', value: 'strong' },
]

const colorPalette = ['#1f1f21', '#313234', '#4b4b4c', '#3c1f00', '#633300', '#8a5b21', '#9d6f39']

const gridImages = ['./2.png', './icon-3.png', './icon-4.png', './icon-5.png', './icon-5.png', './icon-7.png', './icon-8.png', './icon-9.png', './icon-9.png']

function createGridOptions(prefix: string) {
  return gridImages.map((img, index) => ({
    img,
    key: `${prefix}-${index + 1}`,
    label: `Вариант ${index + 1}`,
  }))
}

const parentPickerOptions: GridPickerOption[] = Array.from({ length: MAX_PARENT + 1 }, (_, index) => ({
  img: gridImages[index % gridImages.length],
  key: index,
  label: `Ген ${index}`,
}))

const hairPickerOptions = computed<GridPickerOption[]>(() =>
  getHairList().map((hairId, index) => ({
    img: gridImages[index % gridImages.length],
    key: hairId,
    label: `Вариант ${index + 1}`,
  })),
)

function createClothesOptions(category: keyof typeof CLOTHES_CONFIG) {
  return CLOTHES_CONFIG[category].items.map((item, index) => ({
    img: gridImages[index % gridImages.length],
    key: item.key,
    label: item.label,
  }))
}

const pickerConfigs = computed<Record<PickerId, PickerConfig>>(() => ({
  beard: {
    options: createGridOptions('beard'),
    selectionKey: 'brows',
    title: 'Выбор бороды',
  },
  bottom: {
    options: createGridOptions('bottom'),
    selectionKey: 'bag',
    title: 'Выбор вниз',
  },
  gen1: {
    options: parentPickerOptions,
    selectionKey: 'gen1',
    title: 'Выбор ген 1',
  },
  gen2: {
    options: parentPickerOptions,
    selectionKey: 'gen2',
    title: 'Выбор ген 2',
  },
  hair: {
    options: hairPickerOptions.value,
    selectionKey: 'hair',
    title: 'Выбор прически',
  },
  shoes: {
    options: createClothesOptions('shoes'),
    selectionKey: 'shoes',
    title: 'Выбор обуви',
  },
  top: {
    options: createClothesOptions('top'),
    selectionKey: 'accessory',
    title: 'Выбор вверх',
  },
}))

const sliders = reactive({
  ageOpacity: 0,
  bodyDefectOpacity: 0,
  bodyHairOpacity: 0,
  colorOpacity: 0,
  faceDefectOpacity: 0,
  hairWidth: 0,
  similarity: 0,
  skinColor: 0,
})

const axisFields = reactive({
  faceShape: {
    x: 0,
    y: 0,
  },
})

const selections = reactive({
  accessory: 'top-1',
  aging: 'none',
  bag: 'bottom-1',
  bodyDefect: 'none',
  bodyHair: 0,
  bodyHairPrimaryColor: colorPalette[0],
  brows: 'none',
  browPrimaryColor: colorPalette[0],
  faceDefect: 'none',
  freckles: 'none',
  gender: 'male',
  gen1: 0,
  gen2: 0,
  hair: 0,
  hairPrimaryColor: colorPalette[0],
  hairSecondaryColor: colorPalette[0],
  lipstick: 'none',
  makeup: 0,
  eyeColor: 26,
  eyeShape: 'default',
  shoes: 'shoes-1',
})

function formatSliderValue(value: number) {
  return value.toFixed(2)
}

function getPickerSelectionLabel(pickerId: PickerId) {
  const config = pickerConfigs.value[pickerId]
  const value = selections[config.selectionKey] as GridPickerKey
  const option = config.options.find((item) => item.key === value)

  return option?.label ?? 'Выберите вариант'
}

function getHairList() {
  return selections.gender === 'female' ? HAIR_LIST_FEMALE : HAIR_LIST_MALE
}

function getHairColor(color: string) {
  return Math.max(0, colorPalette.indexOf(color))
}

function applyBlend() {
  trig(
    'cc:setHeadBlend',
    clamp(Number(selections.gen1), 0, MAX_PARENT),
    clamp(Number(selections.gen2), 0, MAX_PARENT),
    clamp(Number(selections.gen1), 0, MAX_PARENT),
    clamp(Number(selections.gen2), 0, MAX_PARENT),
    (sliders.similarity + 1) / 2,
    (sliders.skinColor + 1) / 2,
  )
}

function applyHair() {
  const hairId = Number(selections.hair) || getHairList()[0] || 0

  trig('cc:setHair', hairId)
  trig('cc:setHairColor', getHairColor(selections.hairPrimaryColor), getHairColor(selections.hairSecondaryColor))
}

function applyClothes(category: keyof typeof CLOTHES_CONFIG, key: string) {
  const config = CLOTHES_CONFIG[category]
  const item = config.items.find((entry) => entry.key === key) ?? config.items[0]

  trig('cc:setClothes', config.component, item.drawable, item.texture)
}

function saveCharacter() {
  if (characterName.first.trim().length < 2 || characterName.last.trim().length < 2) {
    return
  }

  if (Number(characterName.age) < 18 || Number(characterName.age) > 80) {
    return
  }

  const payload = {
    blend: {
      father: clamp(Number(selections.gen1), 0, MAX_PARENT),
      mother: clamp(Number(selections.gen2), 0, MAX_PARENT),
      shapeMix: (sliders.similarity + 1) / 2,
      skinFather: clamp(Number(selections.gen1), 0, MAX_PARENT),
      skinMix: (sliders.skinColor + 1) / 2,
      skinMother: clamp(Number(selections.gen2), 0, MAX_PARENT),
    },
    clothes: {
      4: CLOTHES_CONFIG.bottom.items.find((item) => item.key === selections.bag),
      6: CLOTHES_CONFIG.shoes.items.find((item) => item.key === selections.shoes),
      11: CLOTHES_CONFIG.top.items.find((item) => item.key === selections.accessory),
    },
    face: {
      eyes_open: sliders.hairWidth,
      face_shape_x: axisFields.faceShape.x,
      face_shape_y: axisFields.faceShape.y,
    },
    gender: selections.gender,
    hair: {
      color1: getHairColor(selections.hairPrimaryColor),
      color2: getHairColor(selections.hairSecondaryColor),
      hairId: Number(selections.hair) || 0,
    },
    name: {
      first: characterName.first.trim(),
      last: characterName.last.trim(),
      age: Number(characterName.age),
    },
    appearance: {
      eyeColor: Number(selections.eyeColor),
      overlays: {
        blemishes: {
          id: 0,
          value: selections.faceDefect === 'none' ? 255 : 0,
          opacity: sliders.faceDefectOpacity,
        },
        brows: {
          id: 2,
          value: selections.brows === 'none' ? 255 : 0,
          opacity: sliders.colorOpacity,
          color: getHairColor(selections.browPrimaryColor),
        },
        ageing: {
          id: 3,
          value: selections.aging === 'none' ? 255 : 0,
          opacity: sliders.ageOpacity,
        },
        makeup: {
          id: 4,
          value: Number(selections.makeup),
          opacity: sliders.ageOpacity,
        },
        freckles: {
          id: 9,
          value: selections.freckles === 'none' ? 255 : 0,
          opacity: 1,
        },
        chestHair: {
          id: 10,
          value: Number(selections.bodyHair),
          opacity: sliders.bodyHairOpacity,
          color: getHairColor(selections.bodyHairPrimaryColor),
        },
      },
    },
  }

  trig('cc:save', ccSlot.value, JSON.stringify(payload))
}

watch(activeTab, focusCameraForTab, { immediate: true })
watch(() => selections.gender, (gender) => {
  trig('cc:setGender', gender)

  if (!getHairList().includes(Number(selections.hair))) {
    selections.hair = getHairList()[0] ?? 0
  }
})
watch(() => [selections.gen1, selections.gen2, sliders.similarity, sliders.skinColor], applyBlend, { immediate: true })
watch(() => [selections.hair, selections.hairPrimaryColor, selections.hairSecondaryColor], applyHair, { immediate: true })
watch(() => selections.accessory, (value) => applyClothes('top', value), { immediate: true })
watch(() => selections.bag, (value) => applyClothes('bottom', value), { immediate: true })
watch(() => selections.shoes, (value) => applyClothes('shoes', value), { immediate: true })
watch(() => sliders.hairWidth, (value) => trig('cc:setFaceFeature', FACE_FEATURES.eyesOpen, value), { immediate: true })
watch(() => axisFields.faceShape.x, (value) => trig('cc:setFaceFeature', FACE_FEATURES.faceShapeX, value), { immediate: true })
watch(() => axisFields.faceShape.y, (value) => trig('cc:setFaceFeature', FACE_FEATURES.faceShapeY, value), { immediate: true })
watch(() => selections.eyeColor, (value) => {
  trig('cc:setEyeColor', value)
}, { immediate: true })

watch(() => selections.brows, () => {
  trig('cc:setHeadOverlay', 2, selections.brows === 'none' ? 255 : 0, sliders.colorOpacity)
}, { immediate: true })

watch(() => sliders.colorOpacity, (value) => {
  trig('cc:setHeadOverlay', 2, selections.brows === 'none' ? 255 : 0, value)
}, { immediate: true })

watch(() => selections.browPrimaryColor, (value) => {
  trig('cc:setHeadOverlayColor', 2, 1, getHairColor(value), 0)
}, { immediate: true })

watch(() => selections.faceDefect, () => {
  trig('cc:setHeadOverlay', 0, selections.faceDefect === 'none' ? 255 : 0, sliders.faceDefectOpacity)
}, { immediate: true })

watch(() => sliders.faceDefectOpacity, (value) => {
  trig('cc:setHeadOverlay', 0, selections.faceDefect === 'none' ? 255 : 0, value)
}, { immediate: true })

watch(() => selections.aging, () => {
  trig('cc:setHeadOverlay', 3, selections.aging === 'none' ? 255 : 0, sliders.ageOpacity)
}, { immediate: true })

watch(() => selections.freckles, () => {
  trig('cc:setHeadOverlay', 9, selections.freckles === 'none' ? 255 : 0, 1)
}, { immediate: true })

watch(() => selections.makeup, (value) => {
  trig('cc:setHeadOverlay', 4, value, sliders.ageOpacity)
}, { immediate: true })

watch(() => selections.lipstick, () => {
  trig('cc:setHeadOverlay', 10, selections.lipstick === 'none' ? 255 : 0, 1)
}, { immediate: true })

watch(() => selections.bodyHair, (value) => {
  trig('cc:setHeadOverlay', 10, value, sliders.bodyHairOpacity)
}, { immediate: true })

watch(() => sliders.bodyHairOpacity, (value) => {
  trig('cc:setHeadOverlay', 10, selections.bodyHair, value)
}, { immediate: true })

watch(() => selections.bodyHairPrimaryColor, (value) => {
  trig('cc:setHeadOverlayColor', 10, 1, getHairColor(value), 0)
}, { immediate: true })

</script>

<style lang="scss" scoped>





.creator-gen-select {
  width: 100%;
  border-radius: px-to-vh(39);
  max-width: px-to-vh(466);
  height: px-to-vh(566);
  background:
      radial-gradient(70% 85% at 85% 100%, rgba(80, 38, 160, 0.34) 0%, rgba(80, 38, 160, 0) 72%),
      radial-gradient(60% 75% at 15% 100%, rgba(55, 30, 110, 0.18) 0%, rgba(55, 30, 110, 0) 78%),
      linear-gradient(180deg, #1b1b20 0%, #17171b 52%, #191326 100%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgba(255,255,255,0.03);
}
.creator-gen-select__title {
  color: #FFFFFF;
  font-size: px-to-vh(24);
  padding-bottom: px-to-vh(15);
}
.creator-gen-select__field {
  padding: px-to-vh(27);
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);

}
.creator-gen-select__actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: px-to-vh(7);


}
.creator-gen-select__button {
  background: #101010;
  padding: px-to-vh(13) px-to-vh(77);
  color: #FFFFFF;
  font-size: px-to-vh(15);
  border: none;
  border-radius: px-to-vh(8);
  cursor: pointer;

}
.creator-gen-select__field-item {
  display: flex;
  gap: px-to-vh(11);
}


.creator-skin__editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);
  min-height: 0;
}

.creator-skin-editor__item {
  background: rgb(16, 16, 16,0.9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: px-to-vh(48);
  border-radius: px-to-vh(8);
  padding: px-to-vh(16);

}
.creator-skin__editor-item__left {
  color: #FFFFFF;
  font-size: px-to-vh(15);

}
.creator-skin__editor-item__right {
  color: #D2D2D2;
  display: flex;
  align-items: center;
  gap: px-to-vh(7);
  font-size: px-to-vh(12);

}
.creator-skin__editor__arrow {
  background: rgba(28,28,28,1);
  width: px-to-vh(12);
  display: flex;
  align-items: center;
  justify-content: center;
  height: px-to-vh(12);

}
.creator-colors {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);
  min-height: 0;
}

.creator-colors__item {
  background: rgb(16, 16, 16,0.9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: px-to-vh(48);
  border-radius: px-to-vh(8);
  padding: px-to-vh(16);
}

.creator-colors-item__left {
  color: #FFFFFF;
  font-size: px-to-vh(15);
}

.creator-colors-item__right {
  color: #D2D2D2;
  display: flex;
  align-items: center;
  gap: px-to-vh(7);
  font-size: px-to-vh(12);
}

.creator-colors-slider__row {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
  width: px-to-vh(150);
}

.creator-colors-row__value {
  color: rgba(255, 255, 255, 0.28);
  font-size: px-to-vh(14);
  font-weight: 500;
  min-width: px-to-vh(38);
}

.creator-skin__editor-actions-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: px-to-vh(7);
  margin-top: px-to-vh(30);
}
.creator-skin-editor__button {
  background: #101010;
  padding: px-to-vh(13) px-to-vh(77);
  color: #FFFFFF;
  font-size: px-to-vh(15);
  border: none;
  border-radius: px-to-vh(8);
  cursor: pointer;


}
.creator-skin__editor-slider__row {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
  width: px-to-vh(150);
}
.creator-skin__editor-row__value {
  font-size: px-to-vh(14);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.28);
  min-width: px-to-vh(38);
}



.creator {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 0 auto;
  margin-right: px-to-vh(20);
  box-sizing: border-box;
}

.creator-picker-panel {
  position: absolute;
  left: px-to-vh(20);
  top: 50%;
  transform: translateY(-50%);
  width: fit-content;
  padding: px-to-vh(27);
  border-radius: px-to-vh(39);
  background:
      radial-gradient(70% 85% at 85% 100%, rgba(80, 38, 160, 0.34) 0%, rgba(80, 38, 160, 0) 72%),
      radial-gradient(60% 75% at 15% 100%, rgba(55, 30, 110, 0.18) 0%, rgba(55, 30, 110, 0) 78%),
      linear-gradient(180deg, #1b1b20 0%, #17171b 52%, #191326 100%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgba(255,255,255,0.03);
  box-sizing: border-box;
}

.creator__container {
  width: 100%;
  max-width: px-to-vh(466);
  border-radius: px-to-vh(39);
  background:
      radial-gradient(px-to-vh(600) px-to-vh(300) at 20% 10%, rgba(120,50,255,0.3), transparent),
      radial-gradient(px-to-vh(600) px-to-vh(300) at 80% 90%, rgba(80,30,180,0.3), transparent),
      linear-gradient(180deg,#0b0b12,#0a0a10);
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  padding: px-to-vh(23) px-to-vh(37);
  height: px-to-vh(747);
}

.creator__container--blocked {
  opacity: 0.42;
  pointer-events: none;
  filter: brightness(0.75);
}


.creator__title {
  color: #FFFFFF;
  font-size: px-to-vh(24);
  text-align: center;
}
.creator__tabs {
  display: flex;
  gap: px-to-vh(7);
  align-items: center;
  margin-bottom: px-to-vh(13);
  margin-top: px-to-vh(7);
}
.tab {
  appearance: none;
  box-sizing: border-box;
  flex: 0 0 px-to-vh(28);
  border-radius: px-to-vh(34);
  border: px-to-vh(2) solid transparent;
  background: rgba(48, 48, 48,1);
  padding: px-to-vh(5);
  width: px-to-vh(28);
  height: px-to-vh(28);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 0;
}
.tab--active {
  border-color: #fff;
}
.item__left {
  color: #FFFFFF;
}



.item__right {
  color: #525252;
  display: flex;
  align-items: center;
  gap: px-to-vh(7);
}

.creator-picker-trigger {
  appearance: none;
  padding: 0;
  border: none;
  background: transparent;
  color: #D2D2D2;
  cursor: pointer;
  font: inherit;
}

.creator-picker-trigger:hover {
  color: #FFFFFF;
}

.item {
  background: rgb(16, 16, 16,0.9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: px-to-vh(48);
  border-radius: px-to-vh(8);
  padding: px-to-vh(16);

}
.creator__list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);
  min-height: 0;
}
.creator__btn {
  display: flex;
  align-items: center;
  padding: px-to-vh(13) px-to-vh(126);
  background: #101010;
  color: #FFFFFF;
  border: none;
  border-radius: px-to-vh(8);
  justify-content: center;
  width: px-to-vh(288);
  margin-left: px-to-vh(9);
  margin-top: px-to-vh(50);
}
.slider {
  display: flex;
  align-items: center;
  gap: px-to-vh(10);
  width: px-to-vh(170);
}
.arrow {
  background: rgba(28,28,28,1);
  width: px-to-vh(12);
  display: flex;
  align-items: center;
  justify-content: center;
  height: px-to-vh(12);
}
.creator-hair {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);
  min-height: 0;

}
.creator-hair-width {
  height: px-to-vh(100);
  padding: 0 px-to-vh(28);
  border-radius: px-to-vh(18);

  display: flex;
  align-items: center;
  justify-content: center;
  gap: px-to-vh(18);

  background: rgba(0, 0, 0, 0.72);
}

.creator-hair__slider {
  color: #ffffff;
}
.creator-hair-box__label {
  color: #FFFFFF;
}

.creator-axis-field {
  width: 100%;
  padding: px-to-vh(12) 0;
  border-radius: px-to-vh(12);
  background: rgba(0, 0, 0, 0.72);
}




.creator-clothes-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);
  min-height: 0;
}
.creator-clothes-editor__item {
  background: rgb(16, 16, 16,0.9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: px-to-vh(48);
  border-radius: px-to-vh(8);
  padding: px-to-vh(16);

}
.creator-clothes-editor-item__left {
  color: #FFFFFF;
  font-size: px-to-vh(15);

}
.creator-clothes-editor-editor-item__right {
  color: #D2D2D2;
  display: flex;
  align-items: center;
  gap: px-to-vh(7);
  font-size: px-to-vh(12);

}

.creator-clothes-editor__arrow {
  background: rgba(28,28,28,1);
  width: px-to-vh(12);
  display: flex;
  align-items: center;
  justify-content: center;
  height: px-to-vh(12);

}
.creator-clothes-editor-actions-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: px-to-vh(7);
  margin-top: auto;
  padding-top: px-to-vh(30);

}
.creator-clothes-editor__button {
  background: #101010;
  padding: px-to-vh(13) px-to-vh(77);
  color: #FFFFFF;
  font-size: px-to-vh(15);
  border: none;
  border-radius: px-to-vh(8);
  cursor: pointer;

}

.creator-nickname__wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.creator-nickname__screen {
  width: px-to-vh(466);
  padding: px-to-vh(32);
  border-radius: px-to-vh(40);
  display: flex;
  flex-direction: column;
  gap: px-to-vh(12);
  background:
    radial-gradient(circle at top, rgba(80, 0, 255, 0.35), transparent 60%),
    linear-gradient(180deg, #140a2d 0%, #09090f 100%);
  box-sizing: border-box;
}

.creator-nickname__screen-field {
  position: relative;
  width: 100%;
}

.nickname-field__input {
  width: 100%;
  height: px-to-vh(58);
  padding: 0 px-to-vh(46) 0 px-to-vh(16);
  border: none;
  border-radius: px-to-vh(10);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: px-to-vh(15);
  box-sizing: border-box;
  outline: none;
}

.nickname-field__input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.creator-nickname__screen-icon {
  position: absolute;
  right: px-to-vh(16);
  top: 50%;
  width: px-to-vh(14);
  height: px-to-vh(14);
  transform: translateY(-50%);
  opacity: .55;
}

.creator-nickname__screen-text {
  margin-top: px-to-vh(10);
  color: #B9B9B9;
  font-size: px-to-vh(13);
  line-height: 1.45;
  text-align: center;
}

.creator-nickname-screen__actions {
  display: flex;
  gap: px-to-vh(10);
  margin-top: px-to-vh(14);
}

.creator-nickname-screen__button {
  flex: 1;
  height: px-to-vh(54);
  border: none;
  border-radius: px-to-vh(10);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  font-size: px-to-vh(15);
  cursor: pointer;
}

.creator-screen-form__title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: px-to-vh(7);

}
.creator-form__title {
  color: #FFFFFF;
  font-size: px-to-vh(24);
}
.creator-form__hint {
  color: #ACACAC;
  font-size: px-to-vh(13);
  text-align: center;
  display: block;
  margin-top: px-to-vh(15);

}

.creator-form__text {
  text-align: center;
  color: #ACACAC;
  font-size: px-to-vh(16);
  margin-bottom: px-to-vh(20);
}

.creator-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
  border-radius: px-to-vh(39);
  width: 100%;
  max-width: px-to-vh(480);
  height: px-to-vh(500);
  background:
      radial-gradient(70% 85% at 85% 100%, rgba(80, 38, 160, 0.34) 0%, rgba(80, 38, 160, 0) 72%),
      radial-gradient(60% 75% at 15% 100%, rgba(55, 30, 110, 0.18) 0%, rgba(55, 30, 110, 0) 78%),
      linear-gradient(180deg, #1b1b20 0%, #17171b 52%, #191326 100%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgba(255,255,255,0.03);
}



.creator-screen__creator-form--name {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

}



.creator-form__field {
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);
}

.creator-form__panel {
  padding: px-to-vh(16) px-to-vh(19);
}

.creator-form__actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: px-to-vh(7);
  margin-top: px-to-vh(40);

}

.creator-form-screen__button {
  background: #101010;
  padding: px-to-vh(13) px-to-vh(77);
  color: #FFFFFF;
  font-size: px-to-vh(15);
  border: none;
  border-radius: px-to-vh(8);
  cursor: pointer;

}
.creator-form-screen__icon {
  position: absolute;
  right: 3%;
  transform: translateY(-50%);
  top: 50%;
}
.creator-form__field__label {
  position: relative;
}


.creator-gen-select {
  width: 100%;
  border-radius: px-to-vh(39);
  max-width: px-to-vh(466);
  height: px-to-vh(566);
  background:
      radial-gradient(70% 85% at 85% 100%, rgba(80, 38, 160, 0.34) 0%, rgba(80, 38, 160, 0) 72%),
      radial-gradient(60% 75% at 15% 100%, rgba(55, 30, 110, 0.18) 0%, rgba(55, 30, 110, 0) 78%),
      linear-gradient(180deg, #1b1b20 0%, #17171b 52%, #191326 100%);
  box-shadow: inset 0 0 0 px-to-vh(1) rgba(255,255,255,0.03);
}
.creator-gen-select__title {
  color: #FFFFFF;
  font-size: px-to-vh(24);
  padding-bottom: px-to-vh(15);
}
.creator-gen-select__field {
  padding: px-to-vh(27);
  display: flex;
  flex-direction: column;
  gap: px-to-vh(7);

}
.creator-gen-select__actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: px-to-vh(7);


}
.creator-gen-select__button {
  background: #101010;
  padding: px-to-vh(13) px-to-vh(77);
  color: #FFFFFF;
  font-size: px-to-vh(15);
  border: none;
  border-radius: px-to-vh(8);
  cursor: pointer;

}
.creator-gen-select__field-item {
  display: flex;
  gap: px-to-vh(11);
}

</style>
