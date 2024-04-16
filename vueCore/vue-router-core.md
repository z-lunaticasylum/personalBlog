**前言：本篇浅谈下 Vue Router 的实现原理**
### 一、初始化过程
1. 使用 Vue router 是通过 new VueRouter 然后传入 routes 数组，即配置的每一个路由对象；源码中，VueRouter 是一个类，执行 new VueRouter 首先就是对 routes 路由数组进行处理，将所有的路由路径存放到一个数组 pathList 中，然后创建一个对象 pathMap 存储路径及其对应的路由记录 record 对象的映射关系；record 对象上有许多属性，包括 path 路径、components 路由对应的组件以及配置的 route 上的所有属性等等；record 对象在后续路由的跳转、更新、router-view 中的组件渲染有重要作用；
2. 接着会创建一个匹配器对象，这个对象包含几个方法，分别是添加路由记录、获取路由记录以及匹配路由记录；
3. 然后就会根据不同的路由模式，创建不同的 history 对象，进行路由的历史管理；  
    * 比如说，当 mode 为 hash 时，采用哈希模式，那么就会执行 new HashHistory；因为路由可以有多种模式，所以源码中将不同模式的操作封装成了不同的类去处理；如果是 hash 模式，就执行 new HashHistory；首先是对 url 路径的处理，拿到当前路径的哈希值，如果是首次加载，没有指定跳转的路径，那么就没有哈希值，会在 url 上的 / 后面拼接上 # 再拼接上 /；此时的初始化逻辑就走到这里。    
    此外，在 history 类中还定义了许多方法，例如路由跳转的方法、监听路径变化时的处理，等等。
### 二、Vue.use() 进行插件的使用
1. new Vue Router 初始化完成之后，通过 Vue.use() 进行插件的注册；调用 Vue.use() 时，会触发插件对象的 install() 方法；install() 方法的核心，首先通过 Vue.mixin() 向每一个组件的 beforeCreate() 生命周期钩子注入执行 router 对象的 init() 方法逻辑；
2. init() 方法主要做的事情，就是设置路径变化的监听器；比如是 hash 模式，那么就用 window.addEventListener 监听 hashchange 事件，在每一次 hash 变化时，拿到要跳转到的目标路径字符串，调用 transitionTo() 进行路由跳转；其实源码中做了一个判断，即使是采用 hash 模式，但是会判断当前环境是否支持 HTML5  的 history API，如果支持，就会转成监听 popstate 事件；不支持才会用 hashchange 事件进行兜底；
    > 为什么会优先采用 history API 呢？   
    因为 hash 原本是来做锚点页面定位的，用来做监听路径变化似乎违背了初衷，并且锚点功能也就不能使用了，如果要实现，那只能手动来实现了；    
    并且 history 中的 pushState API 在进行路径跳转时，可以传递一些比较复杂的数据，等到触发 popState 事件触发时，可以拿到该数据
3. 接着在 Vue 根组件对象上通过 Vue.defineReactive 添加一个 _route 响应式属性，对应的值是当前的路由对象，等到路由跳转时，也会改变这个 _route 属性的值，由于是响应式数据，视图也能得到更新；
4. 然后调用 history 对象上的 listen 方法，传入一个 cb 回调，并保存在 history 对象的 cb 属性，等到路由进行跳转时，将最新的 route 对象赋值给 Vue 根实例对象上的 _route 属性，因为是响应式数据，等到赋值的时候，也就触发了 set，进一步地去更新视图；
5. 最后就是在 Vue 根组件实例上挂载了 $router 和 $route 属性，以便能在每个组件中通过 this.*** 访问到这两个属性；以及全局注册 router-view 和 router-link 组件
### 三、路由跳转
1. 点击 router-link 进行跳转时，调用 router 实例对象上的 push 方法，进一步调用 history 对象上的 push；在 push 中调用路由跳转的核心方法: transitionTo；
2. 在 transitionTo 中首先拿到要跳转的目标路由对象，接着调用 confirmTransition，在 confirmTransition 中首先判断如果是当前的路由跟要跳转的目标路由是否相同，如果相同，那么就不跳转；
    > * 如果不相同，那么就拿到当前路由和要跳转目标路由的重复使用部分、失活部分以及要激活部分；比如说，当前路径是 /home/a/b 要跳转到 /home/c，那么重用的路由部分是 /home，失活部分是 /c，待激活部分是 /home/a；
    > * 接着通过 runQueue 方法，执行 queue 队列中的导航守卫函数，也就是进行导航守卫解析；完整的导航解析过程是这样的：
    >   ``` mermaid
    >   flowchart TB
    >     A(["导航触发"])-->
    >     B(["在失活的组件中调用 beforeRouteLeave 守卫"])-->
    >     C(["    重复使用的组件中调用 beforeRouteUpdate"])-->
    >     D(["调用路由配置中的 beforeEnter"])-->
    >     E(["解析异步的路由组件"])-->
    >     F(["被激活的组件中调用 beforeRouteEnter"])-->
    >     G(["调用全局的 beforeResolve"])-->
    >     H(["确认导航"])-->
    >     I(["调用全局的 afterEach"])-->
    >     J(["触发 DOM 更新"])
    >   ```
    > * 等到所有的路由导航守卫执行完之后，调用 updateRoute 方法，这个方法是拿到 history 对象上的 cb 函数并执行，也就是更新 route 对象，触发响应式数据对应的视图更新；

3. 不同的模式采用不同的方法，比如 history 模式，调用 history.pushState()；而 hash 模式，则会判断是否支持 HTML5  的 history 相关 api，如果支持，则也是调用 history.pushState()，如果不支持，就调 window.location.hash 设置 hash 值；
### 四、router-view 组件
1. 该组件是一个函数式组件，没有 data 选项，没有组件实例，返回的是一个对象。其不会直接渲染 router-view 组件，而是根据其中的 render 函数中的逻辑，来决定渲染内容。对象中包含 name props functional 和一个 render() 函数。具体的实现过程是通过父级，也就是 Vue 根对象上的 createElement() 方法，对匹配到的路由记录 record 中的 component 进行渲染

