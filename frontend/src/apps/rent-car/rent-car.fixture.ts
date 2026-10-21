import type { RentCarPayload } from '@/shared/contracts/ui'

const cdn = 'http://83.217.193.115:9001/renders/vehicles'
const colors = [
  { colorId: 0, name: 'Чёрный', color: '#0D1117' },
  { colorId: 111, name: 'Белый', color: '#F5F5F7' },
  { colorId: 27, name: 'Красный', color: '#C62828' },
]

export const rentCarFixture: RentCarPayload = {
  vehicles: [
    { id: 1, model: 'stryder', name: 'Nagasaki Stryder', price: 450, image: `${cdn}/nagasaki_stryder.png`, colors },
    { id: 2, model: 'enduro', name: 'Dinka Enduro', price: 300, image: `${cdn}/dinka_enduro.png`, colors },
    { id: 3, model: 'scorcher', name: 'Scorcher', price: 100, image: `${cdn}/scorcher.png`, colors },
    { id: 4, model: 'bagger', name: 'Western Bagger', price: 350, image: `${cdn}/western_bagger.png`, colors },
    { id: 5, model: 'faggio3', name: 'Pegassi Faggio Sport', price: 250, image: `${cdn}/pegassi_faggio_sport.png`, colors },
    { id: 6, model: 'faggio2', name: 'Pegassi Faggio Mod', price: 225, image: `${cdn}/pegassi_faggio_mod.png`, colors },
    { id: 7, model: 'cruiser', name: 'Cruiser', price: 75, image: `${cdn}/cruiser.png`, colors },
    { id: 8, model: 'bmx', name: 'BMX', price: 50, image: `${cdn}/bmx.png`, colors },
  ],
  minHours: 1,
  maxHours: 8,
}