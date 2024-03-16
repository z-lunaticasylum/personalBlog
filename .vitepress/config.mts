// import mermaid from 'mermaid'
import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: "zasylum博客",
    description: "记录前端学习日常",
    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      nav: [
        { text: '首页', link: '/' },
        { text: '文章', link: '/vueCore/vue2-core' }
      ],
  
      sidebar: [
        {
          text: 'Vue 源码系列',
          items: [
            { text: 'Vue2 源码', link: '/vueCore/vue2-core.md' },
            { text: 'Vue3 源码', link: '/vueCore/vue3-core.md' },
          ]
        },
        {
          text: 'Webpack 相关',
          items: [
            { text: 'webpack 的生命周期/执行流程', link: '/webpack/webpackLifecycle' },
            { text: 'webpack 的热更新', link: '/webpack/webpackHMR' }
          ]
        }
      ],
  
      socialLinks: [
        // { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
      ]
    },
    head: [
      ['link', { rel: 'stylesheet', href: '/public/style/custom.css' }],
      ['link', { rel: 'icon', href: '/public/assets/favicon.ico' }],
    ] 
  })
)
