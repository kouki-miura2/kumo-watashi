<script setup lang="ts"></script>

<template>
  <v-container class="d-flex flex-column align-center ga-8 py-8 py-md-16">
    <div class="w-100" style="max-width: 640px">
      <h1 class="text-h4 font-weight-bold">ファイルを転送する</h1>
      <p class="text-body-1 text-medium-emphasis">
        1分だけクラウドに預け、期限が来たら自動で消えます。
      </p>
    </div>

    <v-row class="w-100" style="max-width: 640px">
      <v-col cols="12" sm="6">
        <v-card
          to="/uploader"
          color="#0E1B24"
          theme="dark"
          rounded="lg"
          elevation="3"
          class="d-flex flex-column h-100"
        >
          <v-card-item>
            <template #prepend>
              <v-avatar color="rgba(255,255,255,0.14)" size="48">
                <v-icon icon="mdi-cloud-upload-outline" size="28" />
              </v-avatar>
            </template>
            <v-card-title class="text-h6">ファイルを送る</v-card-title>
          </v-card-item>
          <v-card-text class="text-medium-emphasis">
            ファイルをアップロードし、QR コードとワンタイムコードを発行します。
          </v-card-text>
          <v-card-actions class="mt-auto justify-end">
            <span class="d-inline-flex align-center text-body-2 font-weight-medium">
              Uploader へ
              <v-icon icon="mdi-arrow-right" size="18" class="ml-1" />
            </span>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6">
        <v-card to="/downloader" variant="outlined" rounded="lg" class="d-flex flex-column h-100">
          <v-card-item>
            <template #prepend>
              <v-avatar color="grey-lighten-3" size="48">
                <v-icon icon="mdi-tray-arrow-down" size="28" />
              </v-avatar>
            </template>
            <v-card-title class="text-h6">ファイルを受け取る</v-card-title>
          </v-card-item>
          <v-card-text class="text-medium-emphasis">
            QR を読み取るか、8文字のコードを入力して転送に参加します。
          </v-card-text>
          <v-card-actions class="mt-auto justify-end">
            <span class="d-inline-flex align-center text-body-2 font-weight-medium">
              Downloader へ
              <v-icon icon="mdi-arrow-right" size="18" class="ml-1" />
            </span>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-alert
      variant="flat"
      color="grey-lighten-3"
      density="comfortable"
      icon="mdi-information-outline"
      style="max-width: 640px"
    >
      送信するときだけ Google ログインに進みます。受け取りはログイン不要。
    </v-alert>

    <div class="d-flex flex-wrap justify-start ga-2 w-100" style="max-width: 640px">
      <v-chip prepend-icon="mdi-timer-sand" variant="flat" color="grey-lighten-3"
        >1分で自動削除</v-chip
      >
      <v-chip prepend-icon="mdi-file-multiple-outline" variant="flat" color="grey-lighten-3"
        >最大5ファイル / 1件100MB</v-chip
      >
      <v-chip prepend-icon="mdi-database-outline" variant="flat" color="grey-lighten-3"
        >合計500MB</v-chip
      >
    </div>
  </v-container>
</template>
