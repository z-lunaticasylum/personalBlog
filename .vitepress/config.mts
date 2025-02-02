// import mermaid from 'mermaid'
import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import viteCompression from 'vite-plugin-compression'

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: "jf博客",
    description: "记录前端学习日常",
    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      nav: [
        { text: '首页', link: '/' },
        { text: '文章', link: '/vueCore/vue2-core-1' }
      ],
  
      sidebar: [
        {
          text: 'Vue 原理系列',
          items: [
            { text: 'Vue2 原理（一）', link: '/vueCore/vue2-core-1.md' },
            { text: 'Vue2 原理（二）', link: '/vueCore/vue2-core-2.md' },
            { text: 'Vue3 原理', link: '/vueCore/vue3-core.md' },
            { text: 'Vue Router 原理', link: '/vueCore/vue-router-core.md' },
            { text: 'Vuex  原理', link: '/vueCore/vueX-core.md' },
          ]
        },
        {
          text: 'Webpack 相关',
          items: [
            { text: 'webpack 的生命周期/执行流程', link: '/webpack/webpackLifecycle' },
            { text: 'webpack 的热更新', link: '/webpack/webpackHMR' }
          ]
        },
        {
          text: '计算机网络相关',
          items: [
            { text: 'TCP 相关', link: '/computer-nerwork/TCP.md' },
            { text: 'HTTP 相关', link: '/computer-nerwork/HTTP.md' },
            { text: '输入 URL 后会发生什么', link: '/computer-nerwork/URL.md' }
          ]
        },
        {
          text: '测试页面',
          items: [
            { text: '大文件上传', link: '/test/test' }
          ]
        }
      ],
  
      socialLinks: [
        // { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
        // 粤ICP备2024213011号-1
      ],

      // 页脚
      footer: {
        message: '<a href="https://beian.miit.gov.cn">粤ICP备2024213011号-1</a>',
        copyright: 'Copyright © 2019-present zasylum'
      }
    },
    head: [
      ['link', { rel: 'stylesheet', href: '/style/custom.css' }],
      ['link', { rel: 'icon', href: '/assets/favicon.ico' }],
    ],
    vite: {
      plugins: [
        viteCompression()
      ],
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                return id.split('node_modules/')[1].split('/')[0];
              }
            }
          }
        }
      }
    }
  })
)
