### 一、setup 的执行过程解析
1. 上一篇谈到了在 patch 过程中，会根据不同的节点类型进行不同的处理，如果是组件，那么会调用 processComponent() 方法。该方法是用于处理组件的挂载和更新。
```js
if (shapeFlag & ShapeFlags.COMPONENT) {
  // 如果是首次渲染，根组件，则走这里
  processComponent()
}
```
```js
  /**
   * 用于处理组件的挂载和更新
   * @params n1  旧 vnode
   * @params n2  新 vnode
   */
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense ,namespace, slotScopeIds ,optimized) => {
    n2.slotScopeIds = slotScopeIds
    if (n1 == null) {
      // 旧 vnode 不存在，说明是首次渲染
      if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        // 处理 keep-alive 组件
        ;(parentComponent!.ctx as KeepAliveContext).activate(n2, container, anchor, namespace, optimized,)
      } else {
        // 挂载普通组件
        mountComponent(n2, container, anchor, parentComponent, parentSuspense, namespace, optimized, )
      }
    } else {
      // 更新组件
      updateComponent(n1, n2, optimized)
    }
  }
```
2. 调用 mountComponent() 进行组件挂载，创建组件实例
```js
const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace,optimized,) {
  // 创建组件实例
  const instance = (initialVNode.component = createComponentInstance(initialVNode, parentComponent, parentSuspense, ));

  // 初始化 props、slots 然后执行 setup 函数
  setupComponent(instance, false, optimized)

  // 组件内没有异步相关的依赖，走下面
  setupRenderEffect(instance,initialVNode,container,anchor,parentSuspense,namespace,optimized,)
}
```
```js
/**
 * instance 组件实例，也是一个 js 对象
 */
const instance: ComponentInternalInstance = {
  uid: uid++, // 全局唯一组件实例 ID
  vnode,  // 当前组件的 vnode
  type, // 一个对象，里面包含 setup 函数
  parent, // 父组件实例
  appContext, // 当前应用的上下文，包含全局注册的组件、指令、插件配置等
  root: null!, // to be immediately set
  next: null,
  subTree: null!, // will be set synchronously right after creation
  effect: null!,
  update: null!, // will be set synchronously right after creation
  scope: new EffectScope(true /* detached */),
  render: null,
  proxy: null,
  exposed: null,
  exposeProxy: null,
  withProxy: null,

  provides: parent ? parent.provides : Object.create(appContext.provides),
  accessCache: null!,
  renderCache: [],

  // local resolved assets
  components: null,
  directives: null,

  // resolved props and emits options
  propsOptions: normalizePropsOptions(type, appContext),
  emitsOptions: normalizeEmitsOptions(type, appContext),

  // emit
  emit: null!, // to be set immediately
  emitted: null,

  // props default value
  propsDefaults: EMPTY_OBJ,

  // inheritAttrs
  inheritAttrs: type.inheritAttrs,

  // state
  ctx: EMPTY_OBJ,
  data: EMPTY_OBJ,
  props: EMPTY_OBJ,
  attrs: EMPTY_OBJ,
  slots: EMPTY_OBJ,
  refs: EMPTY_OBJ,
  setupState: EMPTY_OBJ,
  setupContext: null,

  // suspense related
  suspense,
  suspenseId: suspense ? suspense.pendingId : 0,
  asyncDep: null,
  asyncResolved: false,

  // lifecycle hooks
  // not using enums here because it results in computed properties
  isMounted: false,
  isUnmounted: false,
  isDeactivated: false,
  bc: null,
  c: null,
  bm: null,
  m: null,
  bu: null,
  u: null,
  um: null,
  bum: null,
  da: null,
  a: null,
  rtg: null,
  rtc: null,
  ec: null,
  sp: null,
}
```
3. 调用 setupComponent() ——> setupStatefulComponent() 执行 setup 函数
```js
function setupComponent(instance, isSSR = false, optimized = false,) {
  const { props, children } = instance.vnode

  // 判断组件是否是有状态的组件
  const isStateful = isStatefulComponent(instance)

  // 初始化 props、slots
  initProps(instance, props, isStateful, isSSR)
  initSlots(instance, children, optimized)

  const setupResult = isStateful
    ? setupStatefulComponent(instance, isSSR)
    : undefined

  return setupResult
}

function setupStatefulComponent(instance, isSSR) {
  /**
   * 获取组件的配置，其中包含 setup 函数
   * 如果是 <script setup></script> 这样的语法，那么会通过 vite 或者其他的打包工具一开始就将其转换成 setup 函数
   */
  const Component = instance.type as ComponentOptions

  // 执行 setup 函数
  const { setup } = Component
  if (setup) {
    // 判断如果 setup 函数的参数大于 1 比如下面的情况
    // setup(props, context)
    // setup(props, { emit })
    // setup(props, { emit, attrs, slots, expose })
    // 则创建一个 setupContext 对象，否则为 null
    const setupContext = (instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null)

    const reset = setCurrentInstance(instance)
    // 执行 setup 前，先暂停依赖收集
    pauseTracking()

    // 执行 setup 函数，拿到返回的结果
    const setupResult = callWithErrorHandling(setup, ...)
    // 执行完 setup 之后，恢复依赖收集
    resetTracking()
    reset()

    ...

    // 处理返回的结果
    handleSetupResult(instance, setupResult, isSSR)
  } else {
    finishComponentSetup(instance, isSSR)
  }
}
```
> 注意这里有个重要的点：在执行 setup 函数之前，会先暂停依赖的收集，即执行 pauseTracking(). 为什么要这么做呢？

> 原因在于：在执行 setup 函数时，就会访问 setup 内的数据，而响应式数据通过 track 和 trigger 管理，当访问到了就会触发 track 进行依赖收集。而在 setup 中，肯定会写上一些不属于当前组件的响应式数据，比如：props，或者其他全局状态，如果此时也收集将其追踪为依赖，那么后续更新会引起不必要的更新以及形成错误的依赖关系。所以在执行 setup 期间，暂停依赖的收集。
```js
/**
 * 暂停收集依赖的逻辑：因为在 track() 中每次收集依赖的时候，都会判断 shouldTrack 是否为 true
 * shouldTrack == true 才会进行依赖收集；trackStack 则是保留上一次的状态，方便恢复原本的状态
 */
// 暂停依赖收集
export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

// 恢复上一次是否进行依赖收集的状态
export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}
```
4. 执行 handleSetupResult() 处理 setup 函数返回的结果
```js
/**
 * 处理 setup() 的返回值
 * @param instance 组件实例
 * @param setupResult setup() 的返回值
 * @param isSSR 是否是 SSR
 */
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    // setup 的返回值是一个函数，保存再 instance.render 中
    instance.render = setupResult as InternalRenderFunction
  } else if (isObject(setupResult)) {
    // setup 的返回值是一个对象，转成一个 proxy 存在 instance.setupState 中
    instance.setupState = proxyRefs(setupResult)
  }
  // 结束组件的处理
  finishComponentSetup(instance, isSSR)
}

/**
 * 因为 setup() 函数除了返回对象，还可以返回一个渲染函数，就像下面这样的形式(官方文档有写)
 */
export default {
  setup() {
    const count = ref(0)
    return () => h('div', count.value)
  }
}
```
5. 执行 finishComponentSetup()
```js
/**
 * 结束组件的处理
 * @param instance 组件实例
 * @param isSSR 是否是 SSR
 * @param skipOptions 是否跳过 options 的处理
 */
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type as ComponentOptions

  // 组件实例上不存在 render 函数
  // 如果已经存在 render 函数，则不进行编译，比如 setup 函数返回的是一个函数，那么就直接放在了 instance.render 中
  if (!instance.render) {
    if (!isSSR && compile && !Component.render) {
    
    /**
     * 这里省略兼容性的代码处理
     */

      /**
       * 将 template 模板字符串编译成 render 函数，然后保存在 Component.render 中；
       * 不过，通过 webpack/vite 创建的工程化项目，不会执行这个方法，因为在一开始编译的时候，
       * 就将 template 模板编译成 render 函数。下面这种情况才会执行 compile() 进行编译
       * const App = {
          template: '<div>{{ msg }}</div>',
          data() { return { msg: 'Hi' } }
         }
         Vue.createApp(App).mount('#app')
       */
      Component.render = compile(template, finalCompilerOptions)

      // 再将 render 函数保存在 instance.render 中
      instance.render = (Component.render || NOOP) as InternalRenderFunction
      if (installWithProxy) {
        installWithProxy(instance)
      }
    }
  }
}
```
6. 处理完 setup 函数之后，回到 mountComponent() 函数中，如果组件中没有 Suspense 和异步依赖，会执行 setupRenderEffect() 方法(回到上面的 mountComponent 方法)
```js
const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace: ElementNamespace, optimized,) => {
  // 组件渲染的核心函数，对于挂载和更新做不同的逻辑处理
  const componentUpdateFn = () => {
    // 组件还未挂载
    if(!instance.isMounted) {
      ...
      // bm m 分别是 onBeforeMount onMounted 生命周期钩子中的回调
      const { bm, m, parent } = instance
      // 执行 onBeforeMount 中的回调
      if (bm) {
        invokeArrayFns(bm)
      }
      ...
      // 执行组件的渲染函数，得到组件的虚拟节点
      // 在 renderComponentRoot 中的核心就是执行 instance 中的 render() 函数
      const subTree = (instance.subTree = renderComponentRoot(instance))
      // 执行 patch 
      // 旧 vnode 不存在，说明是首次渲染
      patch(
        null,
        subTree,
        container,
        anchor,
        instance,
        parentSuspense,
        namespace,
      )
      // 执行 onMount 钩子函数中的回调
      if (m) {
        queuePostRenderEffect(m, parentSuspense)
      }
      ...
      instance.isMounted = true
    }else {
      // 组件已经挂载，说明是进行更新

      // bu u 分别是 onBeforeUpdate onUpdated 生命周期钩子的回调
      let { next, bu, u, parent, vnode } = instance
      ...
      if (bu) {
        invokeArrayFns(bu)
      }
      // 拿到当前更新后的 vnode
      const nextTree = renderComponentRoot(instance);
      // 旧 vnode
      const prevTree = instance.subTree;
      // 根据新旧 vnode 进行 patch 更新
      patch(
        prevTree,
        nextTree,
        // parent may have changed if it's in a teleport
        hostParentNode(prevTree.el!)!,
        // anchor may have changed if it's in a fragment
        getNextHostNode(prevTree),
        instance,
        parentSuspense,
        namespace,
      )
      ...
      if (u) {
        queuePostRenderEffect(u, parentSuspense)
      }
    }
  }

  // 创建响应式 effect 用于渲染，将 componentUpdateFn 传进给 effect
  // 这里是组件能够响应式渲染的核心
  const effect = (instance.effect = new ReactiveEffect(
    componentUpdateFn,
    NOOP,
    () => queueJob(update), // 调用 queueJob 将 update 放进更新队列
    instance.scope, // track it in component's effect scope
  ))

  const update: SchedulerJob = (instance.update = () => {
    if (effect.dirty) {
      effect.run()
    }
  })

  // 这里执行 update() 就是去执行 effect.run(), 也是进一步去执行 componentUpdateFn 函数，也就是执行组件的渲染函数
  // 进行渲染更新
  update()
}
```
