<template>
  <view class="container">
    <web-view class="full" :src="srcUrl" />
  </view>
</template>

<script>
export default {
  data() {
    return {
      srcUrl: "/hybrid/html/web/index.html"
    }
  },
  onReady() {
    // Debug base may ignore manifest orientation; lock at runtime.
    // #ifdef APP-PLUS
    try {
      plus.screen.lockOrientation("landscape-primary")
    } catch (e) {
      // no-op
    }
    // #endif
  }
}
</script>

<style>
.container {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: #000;
  overflow: hidden;
}

.full {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
}
</style>
