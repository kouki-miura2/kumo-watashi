export const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/sample', name: 'sample', component: () => import('../views/SampleView.vue') },
]
