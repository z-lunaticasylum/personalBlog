**前言：本篇浅谈下 webpack 的执行过程**
1. 首先将配置文件中配置的选项和执行的 shell 命令中携带的参数进行合并，得到最终的选项参数；
2. 将得到的参数，也就是整个的配置选项的对象传给 webpack() 函数，去执行内部有一个 create() 方法，得到一个 compiler 对象；是一个重要的对象，在 webpack 的整个生命周期中都存在；
3. 而 compiler 对象是通过 Compiler 类 new 出来的；在 Compiler 类中含有许多钩子函数，这些钩子会在 webpack 执行过程中依次触发。而这些钩子是基于 tapable 库实现的；而 tapable 库的本质则是基于发布订阅模式，通过在一系列钩子中使用 tap() 注册回调，然后在指定的时刻通过 call() 执行回调；这样在 webpack 执行过程中会在特定时刻执行钩子函数，插件监听到对应钩子的执行去触发回调；
```javascript
  // tapable 中一共提供了九种 hook
  // 这里以最基本的同步 hook 举例

  let hook = new SyncHook(["a", "b"]);

  // 注册绑定事件
  hook.tap("flag1", (args1, args2) => {
    // 执行一些代码
    console.log("flag1:", args1, args2)
  })

  // 执行注册绑定的回调
  hook.call("参数1", "参数2")
````
4. 在创建 compiler 对象之后，也会拿到配置选项中的 plugins 选项内容，去注册每一个插件；插件如果是函数，就直接执行；如果是对象，那么就执行对象中的 apply() 方法；接着会将传入的 webpack 配置中的大部分选项转成插件，比如说：mode、devtools、entry、output 等等，判断如果有对应的选项，就 new 一个对应的 plugin，来去初始化；
5. 接着会去调用 compiler.run() 方法，在 run() 方法中主要就是执行该方法内部定义的又一个 run()，接着在这个 run() 中会依次执行在 compiler 对象中初始化的钩子函数，依次是 beforeRun、run，在这些钩子函数对应阶段注册的 plugin 就会去执行；也就是说注册的 plugin 插件就在 webpack 提供的生命周期钩子中去处理代码；
6. 接着就是去执行 compiler 对象中的 compile() 方法；这个方法内部主要也是依次会去执行 beforeCompile、compile、make、finishMake、afterCompile 这个五个钩子函数；
7. 在执行 compile 和 make 这两个钩子之间，会创建一个 compilation 对象实例，通过这个 compilation 来真正开始编译模块；而随着 compilation 对象的创建完成，表示 webpack 的准备阶段完成，下一步就是 modules 模块的生成阶段，进入到 make 钩子函数执行；
8. 上面说到，webpack 配置的选项大部分会被转成插件去初始化，entry 入口选项就是；对应的 entry 相关插件在初始化时，将一个回调通过 tap 注册在了 make 钩子中，当 webpack 走到 make 阶段时，调用 make.call()，执行注册的回调，在回调中执行 compilation.addEntry() 方法，也就是从 entry 入口文件开始编译；
    >注意：在注册回调时，会将 compilation 对象传到回调函数中，因为编译的操作都是依赖于 compilation 对象的；
9. 编译时，会从 entry 选项定义的入口文件开始，将其编译成一个模块；调用的入口函数是 compilation.addEntry()；过程就是从入口文件开始创建 module 模块；由于一个文件模块可能依赖多个其他的文件，所以先做了一个模块的分解，将每一个模块添加到一个队列中；
10. 接着就去执行 buildModule() 方法，执行每一个 module 的 build() 方法，开始对每一个 module 开始构建编译（会判断一个 module 需不需要构建，如果以及构建过，那么就不需要构建了）；
    > module.build() 是一个多态的写法，真正实现的位置是 NormalModule.js 文件中，NormalModule 是继承 Module 类的
11. 编译 module 的核心就是去执行 runLoaders() 方法，遍历所有的 loader 对匹配到的模块内容进行处理，将模块转变成标准的 js 模块；
    > runLoaders() 是 loader-runner 库中的一个方法
12. 调用 parse() 方法将得到的 js 转成 ast 抽象语法树，目的是为了得到当前模块的依赖关系，看还依赖哪些模块，对依赖的模块递归的进行编译；
13. 当 entry 入口文件模块及其依赖的模块编译完成之后，make 阶段执行完毕；接着调用 finishMake 钩子，在钩子注册的回调中执行 compilation 的 seal(), 即 compilation.seal()，进入到 seal 阶段，生成 chunk；生成 chunk 会遵循几个规则：
    * entry 入口的每个文件模块及其依赖的模块会生成一个 chunk；
    * 动态引入的 module 也会生成一个 chunk；
14. 在 seal 阶段会有大量的钩子函数触发，初始化的插件在对应的钩子触发时就会执行，在生成 chunk 过程中进行处理；
15. 当所有的 chunk 生成，那么 compilation 的工作也完成了，seal 阶段也结束；最终就是调用 emitAssets() 方法，将编译后的文件输出到文件夹
> compile 对象和 compilation 对象的区别：
> * compile 对象贯穿 webpack 的整个生命周期，该对象上挂载了许多钩子函数，从编译开始到编译结束，插件通过在钩子上注册回调，等到 webpack 运行到指定的钩子时，就执行对应注册的回调，对编译中各个时期的代码进行处理；  
> * compilation 对象存在于 compiler 对象的 beforeCompile 阶段到 compilation 对象的 seal 阶段；当文件发生修改，重新编译时，都会重新创建一个 compilation 对象；一个 compilation 对象就会对应当前的模块资源、模块编译生成的内容等
> 
> **流程图**：
> ![](./image/image11.png)