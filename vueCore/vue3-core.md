### 一、响应式原理

#### 1、reactive 原理
1. 内部是返回一个 createReactiveObject() 方法；在这个方法内部会经过一系列的判断，比如：判断传进来的对象是否已经响应式处理过了；筛选出能够被代理的对象；判断在 proxyMap 这个 Map 中是否有缓存过的对象；最后通过筛选的对象进行 new Proxy()。
2. 在 new Proxy() 中会传入 get、set 这两个主要的拦截处理函数；get 是调用 createGetter() 方法生成；set 是调用 createSetter() 方法生成。
3. 在 get 中就是进行依赖的收集。跟 vue2 不同的是，vue3 中当 get 被触发时，会调用 track() 方法来进行依赖收集。首先是通过构造一个全局的 WeakMap 对象来进行数据的处理的；这个 WeakMap 对象为 targetMap。targetMap 的 key 是传入 reactive() 的对象，也就是需要响应式处理的对象(称为 obj)；value 是一个 map 对象，为 depsMap，以 obj 对象每一个属性为 key，而 value 是一个 set 集合结构，保存的是依赖对应属性的副作用（比如说 obj 中有一个属性为 count，有一个副作用函数将 obj.count++，那么 set 就是用来保存所有依赖 count 的副作用）。当 obj 的属性被访问的时候，就会收集到所有的依赖。
![](./image/image3.png)
4. 当 obj 中的属性发生改变时，也就是触发到 set，那么会调用 trigger() 方法，去拿到被修改对象属性的 depsMap 的 value 值，也就是 set 对象，遍历执行收集到的副作用，完成更新。
#### 2、ref 原理
1. 因为 reactive 针对的是对象类型数据的响应式处理，而对于原始值，如 Number、undefine、String、Boolean、Symbol、BigInt、null，reactive 的实现本质 proxy 就不能处理了；所以针对原始值类型，提出 ref 来处理；
2. 当使用 ref() 时，会调用 createRef() 创建一个 RefImpl 类的实例，所以经过 ref() 处理过得到的值本质上就是一个对象，是 RefImpl 类的实例对象；
3. 而 RefImpl 类中定义了名为 value 的 get 和 set 的拦截操作；这也就是为什么使用 ref 定义的响应式数据需要 .value；假设 let a = ref(0) 当使用 a.value 时，就会触发 a 对象上的 get() ，首先是调用 trackEffects 进行依赖收集，然后就返回值；等到设置值时，就触发 set 调用 triggerEffects 去通知所有依赖进行修改.
#### 3、ReactiveEffect 类的作用
1. ReactiveEffect 类在 Vue3 的响应式系统中是一个重要的类，可以理解成是 Vue2 中的 Watcher 类；把 ReactiveEffect 类的实例称为 effect;
2. ReactiveEffect 类实例化主要是在三个地方，分别是：
    *   在 render 时实例化的 effect，称为渲染 effect
    *   在实现 computed 中实例化的 effect
    *   在实现 watch 中实例化的 effect
3. 先着重看下响应式系统中如何结合 ReactiveEffect 类进行副作用函数的收集和触发的
    *   在 render 过程中，会 new ReactiveEffect 创建 effect 实例，同时将组件更新的方法传到 ReactiveEffect 类中，在后续中会将这个组件更新的副作用函数进行收集；一个组件就会创建一个渲染 effect；
    *   同时在 new ReactiveEffect 类时，会将 componentUpdateFn() 函数，也就是负责组件的挂载和更新的函数传到类的内部；在 ReactiveEffect 类中有一个 run() 方法，会将 run() 方法赋值给 Vue 实例上一个 update 属性，接着执行 update() 方法，也就是去执行类的 run() 方法；
    *   run() 会拿到负责组件挂载和更新的函数，并执行它，开始了组件的挂载/更新；同时会将一个全局的变量 activeEffect 赋值为当前的渲染 effect；
    *   接着会执行传入到 ReactiveEffect 类的 componentUpdateFn() 方法，进行组件的挂载，在这个方法中会执行 render 函数去生成 Vnode，在这个时候就会访问到响应式数据，触发了 get，进而触发依赖收集；而这里的依赖收集，就是收集当前正在被激活的 effect，就是 activeEffect，也就是当前的渲染 effect；等到响应式数据被修改时就会触发 set，执行 trigger()，去遍历 dep 中所有的 effect，触发他们的更新
### 二、初始化创建过程

#### 1、调用 createApp(App).mount('#app') 发生了什么
1. 在 createApp() 方法实现中，会先执行 ensureRenderer() 这个函数，返回一个对象，这个对象中包含一个跟 createApp() 同名的方法，通过 createApp() 来创建 app 对象；而 createApp() 又是通过 createAppAPI() 方法生成，这个方法还接受了 render 函数作为参数；
```javascript
export const createApp = ((...args) => {
    // ensureRenderer 方法返回的是一个对象，里面包含 crateApp() 方法；
    // 而 createApp() 这个方法是通过 createAppAPI() 返回的
    const app = ensureRenderer().createApp(...args)
    if (__DEV__) {
        // 检查是否是原生标签
        injectNativeTagCheck(app)
        // 检查是否是自定义标签
        injectCompilerOptionsCheck(app)
    }
    // 对 app 中的 mount 作一个缓存
    const { mount } = app

  /**
   * 定义 mount 挂载方法，重写 app.mount() 方法，目的是支持跨平台渲染；
   * 实际用户调用的 mount 就是这个 mount 方法
   * @param containerOrSelector 要挂载的节点
   * @returns 
   */
    app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {}
})
```
* 这里跟 Vue2 源码一样，都对 mount() 方法进行了重写，原因是原有的 mount() 方法是通用的标准渲染方式，因为 Vue 设计的理念就是能够各平台通用，所以原有的 mount() 方法就是通用的渲染流程，不包含任何的平台逻辑和规范：也就是先创建 Vnode 再渲染 Vnode。而重写的 mount() 方法就是针对于 Web 平台的。当然，重写后的 mount() 方法也会调用原来的 mount() 方法。 
2. 在 createAppAPI() 这个方法中主要就是创建 app 对象，在这个对象上挂载了许多属性和方法；属性有 _uid、_component、_props、_container、_context、_instance；而方法中有一个主要的 mount() 方法，也就是进行挂载；
3. 在 mount() 中，首先会通过 createVNode() 方法创建 Vnode，接着就将 Vnode 传给 render()，进行渲染;
4. 在 render() 中主要的，就是调用 patch() 进行；patch() 方法接受多个参数，主要的就是头两个，旧 Vnode 和新 Vnode；如果旧 Vnode 不存在，传了新 Vnode 说明就是初次渲染挂载；如果新旧 Vnode 都存在，说明是进行更新；
5. 在 patch() 中会针对新 Vnode 的不同类型进行不同的处理，比如说文本节点、静态节点、普通的标签元素、组件、vue 内置组件，如：teleport、suspense 等；
    *   如果新旧两个节点完全相同，那么就不用处理，直接 return；如果新旧两个节点不是同一个节点（节点类型或者 key 有一个不同）那也不进行处理，因为 patch 只发生在同一节点上；
    *   文本节点：如果旧节点不存在，那么就创建文本节点，接着插入到对应的位置；如果新旧节点都存在，且文本不同，那么就用新节点的文本替换旧节点文本；
    *   如果是普通的 HTML 元素就调用 processElement() 进行挂载更新
        * 如果旧 Vnode 不存在，那么就直接进行挂载；
        * 如果新旧 Vnode 都存在，那么就调用 patchElement() 进行更新；在 patchElement() 中主要的部分就是调用 patchChildren() 通过 diff 算法进行比较处理更新；
            * 如果新旧 Vnode 都存在，那么就调用 patchElement() 进行更新；在 patchElement() 中主要的部分就是调用 patchChildren() 通过 diff 算法进行比较处理更新；
            * 如果含有 key 的话，就是进行全量 diff；调用 patchKeyedChildren()；分成了五步进行处理；
              > * 首先分别从新旧 Vnode 数组的开头同时开始向后遍历，如果遇到同一个节点，就进行 patch()；如果没有遇到就跳过，继续判断下一对；
              > * 接着从新旧 Vnode 数组的结尾开始向前遍历，如果遇到同一个节点，就进行 patch()；如果没有遇到就跳过，继续判断下一对；
              > * 经过上面两轮循环之后，进行判断，如果新节点数组还有剩余而旧节点数组已经遍历完了，说明新节点数组剩下的都是新增节点，进行新增；
              > * 接着判断，经过两轮循环之后如果旧节点数组还有剩余而新节点数组已经遍历完了，说明旧节点数组剩下的都是没用的，直接删除；
              > * 还有一种情况是，经过两轮遍历之后，新旧 Vnode 数组都有剩余，那么对剩余新旧节点进行处理；