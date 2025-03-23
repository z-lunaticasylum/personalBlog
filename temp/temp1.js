```mermaid
flowchart TB
        style C text-align:left
        A(["function Vue() {}
          内部调用 this._init"
          ]) -->
        B(["Vue.prototype._init()"]) -->
        C["主要做了什么：
        一、给每一个组件实例创建一个唯一的 uid。初始的 Vue 根组件的 uid 是 0
        二、合并组件的选项
        三、调用 initLifecycle 进行组件关系属性的初始化：$parent、$root、$children
        四、调用 initEvents 进行自定义事件的初始化
        五、调用 initRender 进行插槽的初始化
        六、执行 beforeCreate 生命周期函数
        七、调用 initInjections 进行 inject 选项的初始化
        八、调用 initState 进行响应式数据的初始化，依次处理：props、methods、data、computed、watch
        九、调用 initProvide 进行 provide 选项的初始化
        十、执行 created 生命周期函数
        十一、判断是否传入 el 属性，如果有，自动进行挂载；如果 new Vue 时不传 el属性，需要手动进行挂载
        "]
```



```mermaid
flowchart TB
    style H text-align:left;
    style G text-align:left;
    style F text-align:left;
    A(["Vue.prototype._init()"])-->
    B(["initState()"])-->
    C(["initData() "])-->
    D["主要做了什么：判重处理（不能跟 methods 和 props 重复）、
    将 data 中的数据代理到 vue 实例，这样就能通过 this.*** 访问到 data"]-->
    F["将整个的 data 对象传给 observe() 主要做了什么：
    1、判断是否已经经过响应式处理，依据是判断是否含有 __ob__ 属性：
    如果有，那么就已经经过了响应式处理，直接返回这个 ___ob__ 属性；
    如果没有，那么为每一个传到 observe() 的数据 new 一个 Observer 实例；
    2、一个 data 实例化一个 Observer。
    3、只对数组和对象类型才会 new 一个 Observer 实例"]-->
    G[" Observer 类做了什么：
    一、给每一个传入 Observer 的值创建一个属性 __ob__，
    值是 Observer 本身，表示已经经过响应式处理；
    二、判断是对象还是数组；如果是数组，那么就将重写后的七个数组方法放到数组的原型上，
    然后遍历数组中的每个元素做响应式处理，也就是对数组中的每个数据执行 observe() 方法；
    三、如果是对象，那么对对象的每一个 value 执行 defineReactive 方法"]-->
    H["defineReactive() 做了什么：
    一、首先是实例化一个 dep 对象(data 对象中的每一个值都有一个对应的 dep)；
    然后会拿到对象下面的子对象，递归的调用 observe() 方法，进行响应式处理;
    二、接着就是熟知的 Object.defineProperty 去挟持数据的访问；
    当访问数据时，比如在 template 中使用到了 data 中的数据，那么就触发 getter，进行依赖收集；
    三、当数据发生修改时，会先对修改后的新值进行响应式处理，接着通知依赖去进行异步更新"]
```


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


```mermaid
flowchart TB
        style B text-align:left;
        style C text-align:left;
        style D text-align:left;
        style D text-align:left;
        style E text-align:left;
        style F text-align:left;
        A(["Object.defineProperty() 的 set 中挟持数据的修改"]) -->
        B["set 中主要做了什么？
        1、判断新值跟旧值是否有变化，如果没有变化，直接返回；
        2、判断是否是只读属性，也就是判断 setter 是否存在，如果不存在，说明是只读属性，直接返回；
        3、对新值进行响应式处理；
        4、调用 dep.notify() 方法，通知收集到的依赖进行更新"] -->
        C["dep.notiyfy() 方法做了什么？
        1、主要就是遍历收集到的 watcher 数组，调用 watcher 的update() 方法，
        去依次执行各自的更新
        "]-->
        D["watcher 的 update() 方法做了什么？
        1、首先是先进行分类：如果是懒执行的 watcher ，那么就将dirty 属性置为 true，
        比如 computed如果是同步执行的 watcher，那么会直接调用 watcher 的 run() 方法进行更新；
        比如 watch 选项，可以配置 async 选项为 true；都不是，那么就进入通常的流程，
        将 watcher 放进一个 watcher 队列中"]-->
        E["watcher 放入队列之后如何处理？
        1、数据发生变化后，要进行更新是通过一个刷新队列的方法，flushSchedulerQueue()。
        这个方法首先会对 watcher 队列中的 watcher 进行排序，
        按照 watcher 实例创建的先后顺序进行排序，然后再依次执行 watcher 的 run() 方法去触发更新；
        2、这个 flushSchedulerQueue() 刷新队列的方法不是直接执行，
        而是放在 nextTick() 中执行；因为 vue 的更新是异步更新。"]-->
        F[" 因此 nextTick() 方法的原理就是 vue 异步更新的核心
        1、首先调用 nextTick() 时，会将传入 nextTick() 的回调函数放入一个 callBakcs 数组中；
        然后有一个 flushCallbacks() 方法来依次遍历数组执行回调；
        2、接着 nextTick() 会通过一个标志位 pending 判断当前的异步任务队列中是否有 flushCallbacks() 方法，
        如果没有，就会调用一个 timeFunc() 方法，将 flushCallbacks() 放进异步任务队列中。
        是放入到微任务队列还是宏任务队列是判断平台支持哪一种。
        如果支持 Promise，优先使用 Promise，然后依次是 MutationObserver、setImmediate、最后是 setTimeout。
        因此是优先考虑微任务，宏任务次之。"]
```