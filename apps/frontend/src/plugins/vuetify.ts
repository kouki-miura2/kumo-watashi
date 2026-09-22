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
          primary: '#0E1B24',
          secondary: '#5C6B77',
        },
      },
    },
  },
})
