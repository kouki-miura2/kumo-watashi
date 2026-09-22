export const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/uploader', name: 'uploader', component: () => import('../views/UploaderView.vue') },
  {
    path: '/downloader',
    name: 'downloader',
    component: () => import('../views/DownloaderView.vue'),
  },
]
