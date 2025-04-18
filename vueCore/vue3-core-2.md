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
   * 如果是 <script setup></script> 这样的语法，那么会通过 vite 或者其他的打包工具一开始就将其转换成 render 函数
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

> 原因在于：setup 所在的组件有可能会在父组件更新的时候运行，如果在子组件的 setup 中可以收集依赖的话，那么父组件的渲染函数会被收集成依赖，当子组件的响应式对象发生改变时，可能会触发父组件的更新，这肯定是不行的。所以在执行 setup 前先暂停依赖收集，执行完之后，再恢复。
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

      // 将 template 模板字符串编译成 render 函数，然后保存在 Component.render 中
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
6. 处理完 setup 函数之后，回到 mountComponent() 函数中，如果组件中没有 Suspense 和异步依赖，会执行 setupRenderEffect() 方法(回到上面的 mountComponnt 方法)
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
