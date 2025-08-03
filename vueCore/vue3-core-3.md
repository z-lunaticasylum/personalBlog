### 一、生命周期钩子的处理
#### 1、注册
在上一篇中提到在 mountComponent() 组件挂载方法中，会创建组件实例，接着执行 setupComponent() 方法，在这个方法中去执行 setup 函数。用户在 setup 中注册的生命周期钩子也会随着 setup 函数的执行进行处理。
```typescript
// 生命周期的实现(apiLifecycle.ts)

/**
 * 各种生命周期的枚举
 */
export enum LifecycleHooks {
  BEFORE_CREATE = 'bc',
  CREATED = 'c',
  BEFORE_MOUNT = 'bm',
  MOUNTED = 'm',
  BEFORE_UPDATE = 'bu',
  UPDATED = 'u',
  BEFORE_UNMOUNT = 'bum',
  UNMOUNTED = 'um',
  DEACTIVATED = 'da',
  ACTIVATED = 'a',
  RENDER_TRIGGERED = 'rtg',
  RENDER_TRACKED = 'rtc',
  ERROR_CAPTURED = 'ec',
  SERVER_PREFETCH = 'sp',
}

export const onBeforeMount = createHook(LifecycleHooks.BEFORE_MOUNT)
export const onMounted = createHook(LifecycleHooks.MOUNTED)
export const onBeforeUpdate = createHook(LifecycleHooks.BEFORE_UPDATE)
export const onUpdated = createHook(LifecycleHooks.UPDATED)
export const onBeforeUnmount = createHook(LifecycleHooks.BEFORE_UNMOUNT)
export const onUnmounted = createHook(LifecycleHooks.UNMOUNTED)
export const onServerPrefetch = createHook(LifecycleHooks.SERVER_PREFETCH)

/**
 * createHook() 方法，接收一个 lifecycle 标识，表明是哪一个生命周期；
 * 返回的是 injectHook 的执行结果
 */
export const createHook = (lifecycle) =>
  (hook, target = currentInstance) => {
    injectHook(lifecycle, (...args: unknown[]) => hook(...args), target)
  }


/**
 * 将生命周期钩子保存到组件实例上
 * @param type 生命周期钩子类型，比如 beforeMount mounted ...
 * @param hook 生命周期钩子函数
 * @param target 组件实例
 * @param prepend 是否在数组前面插入
 * @returns 
 */
export function injectHook(
  type: LifecycleHooks,
  hook: Function & { __weh?: Function },
  target: ComponentInternalInstance | null = currentInstance,
  prepend: boolean = false,
): Function | undefined {
  if (target) {
    // 看 target 即组件实例上有没有 type 属性，没有则创建一个空数组
    // 比如 target.bm = [] / target.m = []
    // 也就是保存生命周期钩子函数的数组
    const hooks = target[type] || (target[type] = [])
    // 将钩子包装一层，等到执行的时候，就是去执行这个 wrappedHook
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args: unknown[]) => {
        // 暂停响应式收集
        pauseTracking()
        // 设置当前实例上下文
        const reset = setCurrentInstance(target)
        const res = callWithAsyncErrorHandling(hook, target, type, args)
        reset()
        // 恢复响应式收集
        resetTracking()
        return res
      })
      // 回调的优先级处理，默认是 false，在数组后面插入
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  }
}

```

#### 2、执行
生命周期的钩子的执行，是在 setupComponent() 方法执行完之后，也就是 setup() 函数执行之后，在 setupRenderEffect() 中处理。在前一篇中有讲到 setupRenderEffect() 这个函数的执行，里面有一个重要的组件更新渲染函数 componentUpdateFn()，生命周期的钩子在里面进行处理。
```typescript
const componentUpdateFn = () => {
  if (!instance.isMounted) {
    // 组件还没挂载

    // 在实例上取出保存了生命周期钩子的数组 bm m
    const { bm, m, parent } = instance

    // 执行 beforeMounted 钩子
    if (bm) {
      invokeArrayFns(bm)
    }

    /** 省略一些代码 */

    // 执行 patch
    patch();

    // 执行 mounted 钩子
    if (m) {
      queuePostRenderEffect(m, parentSuspense)
    }

  }else {
    // 组件已经挂载

    let { next, bu, u, parent, vnode } = instance

    /** 省略一些代码 */
    
    // 执行 beforeUpdated 钩子
    if (bu) {
      invokeArrayFns(bu)
    }

    const nextTree = renderComponentRoot(instance)
    const prevTree = instance.subTree
 
    // 根据新旧 vnode 进行 patch 更新
    patch(prevTree, nextTree)
    
    next.el = nextTree.el

    // 执行 updated 钩子
    if (u) {
      queuePostRenderEffect(u, parentSuspense)
    }

  }
}
```

### 二、keep-alive 的实现
#### 1、整体实现
keep-alive 的实现是在 KeepAlive.ts 文件中，其本质就是导出了一个 name 为 KeepAlive 的选项式的组件，是一个对象；里面除了包含 name，还有 props 以及 setup() 函数。
```javascript
const KeepAliveImpl = {
  name: `KeepAlive`,
  __isKeepAlive: true,
  /**
   * keep-alive 组件接收三个 props
   * include 缓存白名单，在里面的组件说明要缓存，不在的不缓存
   * exclude 缓存黑名单，在里面的组件说明不缓存，不在的缓存
   * max 缓存的组件实例数量上限
   */
  props: {
    include: [String, RegExp, Array],
    exclude: [String, RegExp, Array],
    max: [String, Number],
  },
  setup(props, { slots }) {}
}
```
#### 2、核心逻辑
keep-alive 组件实现的核心在 setup() 中
```javascript

setup(props: KeepAliveProps, { slots }: SetupContext) {
    const instance = getCurrentInstance()!
    // KeepAlive communicates with the instantiated renderer via the
    // ctx where the renderer passes in its internals,
    // and the KeepAlive instance exposes activate/deactivate implementations.
    // The whole point of this is to avoid importing KeepAlive directly in the
    // renderer to facilitate tree-shaking.
    const sharedContext = instance.ctx as KeepAliveContext

    const cache: Cache = new Map()
    const keys: Keys = new Set()
    let current: VNode | null = null


    const parentSuspense = instance.suspense

    const {
      renderer: {
        p: patch,
        m: move,
        um: _unmount,
        o: { createElement },
      },
    } = sharedContext
    const storageContainer = createElement('div')

    sharedContext.activate = (vnode, container, anchor, namespace, optimized) => {
      const instance = vnode.component!
      move(vnode, container, anchor, MoveType.ENTER, parentSuspense)
      // in case props have changed
      patch(
        instance.vnode,
        vnode,
        container,
        anchor,
        instance,
        parentSuspense,
        namespace,
        vnode.slotScopeIds,
        optimized,
      )
      queuePostRenderEffect(() => {
        instance.isDeactivated = false
        if (instance.a) {
          invokeArrayFns(instance.a)
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeMounted
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance.parent, vnode)
        }
      }, parentSuspense)
    }

    sharedContext.deactivate = (vnode: VNode) => {
      const instance = vnode.component!
      invalidateMount(instance.m)
      invalidateMount(instance.a)

      move(vnode, storageContainer, null, MoveType.LEAVE, parentSuspense)
      queuePostRenderEffect(() => {
        if (instance.da) {
          invokeArrayFns(instance.da)
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance.parent, vnode)
        }
        instance.isDeactivated = true
      }, parentSuspense)

    }

    function unmount(vnode: VNode) {
      // reset the shapeFlag so it can be properly unmounted
      resetShapeFlag(vnode)
      _unmount(vnode, instance, parentSuspense, true)
    }

    function pruneCache(filter?: (name: string) => boolean) {
      cache.forEach((vnode, key) => {
        const name = getComponentName(vnode.type as ConcreteComponent)
        if (name && (!filter || !filter(name))) {
          pruneCacheEntry(key)
        }
      })
    }

    function pruneCacheEntry(key: CacheKey) {
      const cached = cache.get(key) as VNode
      if (cached && (!current || !isSameVNodeType(cached, current))) {
        unmount(cached)
      } else if (current) {
        // current active instance should no longer be kept-alive.
        // we can't unmount it now but it might be later, so reset its flag now.
        resetShapeFlag(current)
      }
      cache.delete(key)
      keys.delete(key)
    }

    // prune cache on include/exclude prop change
    watch(
      () => [props.include, props.exclude],
      ([include, exclude]) => {
        include && pruneCache(name => matches(include, name))
        exclude && pruneCache(name => !matches(exclude, name))
      },
      // prune post-render after `current` has been updated
      { flush: 'post', deep: true },
    )

    // cache sub tree after render
    let pendingCacheKey: CacheKey | null = null
    const cacheSubtree = () => {
      // fix #1621, the pendingCacheKey could be 0
      if (pendingCacheKey != null) {
        // if KeepAlive child is a Suspense, it needs to be cached after Suspense resolves
        // avoid caching vnode that not been mounted
        if (isSuspense(instance.subTree.type)) {
          queuePostRenderEffect(() => {
            cache.set(pendingCacheKey!, getInnerChild(instance.subTree))
          }, instance.subTree.suspense)
        } else {
          cache.set(pendingCacheKey, getInnerChild(instance.subTree))
        }
      }
    }
    onMounted(cacheSubtree)
    onUpdated(cacheSubtree)

    onBeforeUnmount(() => {
      cache.forEach(cached => {
        const { subTree, suspense } = instance
        const vnode = getInnerChild(subTree)
        if (cached.type === vnode.type && cached.key === vnode.key) {
          // current instance will be unmounted as part of keep-alive's unmount
          resetShapeFlag(vnode)
          // but invoke its deactivated hook here
          const da = vnode.component!.da
          da && queuePostRenderEffect(da, suspense)
          return
        }
        unmount(cached)
      })
    })

    return () => {
      pendingCacheKey = null

      if (!slots.default) {
        return null
      }

      const children = slots.default()
      const rawVNode = children[0]
      if (children.length > 1) {
        current = null
        return children
      } else if (
        !isVNode(rawVNode) ||
        (!(rawVNode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) &&
          !(rawVNode.shapeFlag & ShapeFlags.SUSPENSE))
      ) {
        current = null
        return rawVNode
      }

      let vnode = getInnerChild(rawVNode)
      // #6028 Suspense ssContent maybe a comment VNode, should avoid caching it
      if (vnode.type === Comment) {
        current = null
        return vnode
      }

      const comp = vnode.type as ConcreteComponent

      // for async components, name check should be based in its loaded
      // inner component if available
      const name = getComponentName(
        isAsyncWrapper(vnode)
          ? (vnode.type as ComponentOptions).__asyncResolved || {}
          : comp,
      )

      const { include, exclude, max } = props

      if (
        (include && (!name || !matches(include, name))) ||
        (exclude && name && matches(exclude, name))
      ) {
        current = vnode
        return rawVNode
      }

      const key = vnode.key == null ? comp : vnode.key
      const cachedVNode = cache.get(key)

      // clone vnode if it's reused because we are going to mutate it
      if (vnode.el) {
        vnode = cloneVNode(vnode)
        if (rawVNode.shapeFlag & ShapeFlags.SUSPENSE) {
          rawVNode.ssContent = vnode
        }
      }
      pendingCacheKey = key

      if (cachedVNode) {
        // copy over mounted state
        vnode.el = cachedVNode.el
        vnode.component = cachedVNode.component
        if (vnode.transition) {
          // recursively update transition hooks on subTree
          setTransitionHooks(vnode, vnode.transition!)
        }
        // avoid vnode being mounted as fresh
        vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE
        // make this key the freshest
        keys.delete(key)
        keys.add(key)
      } else {
        keys.add(key)
        // prune oldest entry
        if (max && keys.size > parseInt(max as string, 10)) {
          pruneCacheEntry(keys.values().next().value)
        }
      }
      // avoid vnode being unmounted
      vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE

      current = vnode
      return isSuspense(rawVNode.type) ? rawVNode : vnode
    }
  }
```
