import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import './fonts.css'
import { createVuetify } from 'vuetify'

/** Theme skeleton — extend `themes` as the app's branding is defined. */
export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1867c0',
          secondary: '#5cbbf6',
        },
      },
    },
  },
})
