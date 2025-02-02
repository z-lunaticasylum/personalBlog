<template>
  <div>
      <input type="file" class="upload_inp" ref="input"></input>
      <button class="upload_button select" @click="uploadFile" :class="{'loading': isLoading}">点击上传文件</button>
      <p>当前进度: {{ fileProgress }}%</p>
      
      <div class="upload_progress" ref="upload_progress">
        <div class="value" ref="progress_value"></div>
      </div>

      <div>花费时间: {{ time / 1000 }}秒</div>

      <button @click="value++">{{ value }}</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, unref } from "vue"
// import { defHttp1 } from "/@/utils/http/axios";
import {http1} from "./api"
import OSS from "ali-oss"
import type { Checkpoint } from "ali-oss";
// import VConsole from 'vconsole'

// const vConsole = new VConsole()

interface AccesskeyType {
  policy: string,
  OSSAccessKeyId: string,
  signature: string,
  host: string
}

interface ResultAccessKey {
  code: number,
  result: AccesskeyType
}

interface CheckPointsType {
  [prop: string]: any
}

interface AMultipartFileOptions {
  partSize: number,
  progress: ((...args: any[]) => any) | undefined,
  checkpoint?: any
}

// 设定决定是直接上传还是分片上传的界限
const partSizeLimit = 1024 * 1024 * 2;

// 分片上传时最小分片
const partSize = 1024 * 1024 * 4;

// 存储每个分片的信息
const savedFileData: CheckPointsType = {};

// 当前上传的进度
let fileProgress = ref(0);

// 花费时间
let time = ref(0);

let value = ref(0)


const input = ref<HTMLInputElement>()
const isLoading = ref(false)
let accessKey: AccesskeyType = {
  policy: "",
  OSSAccessKeyId: "",
  signature: "",
  host: ""
};
const uploadFile = () => {
  if(unref(isLoading)) return
  input.value!.click();
}

const upload_progress = ref<HTMLDivElement>()
const progress_value = ref<HTMLDivElement>()

onMounted(() => {
  // 拿到上传文件需要的信息
  http1.request<ResultAccessKey>({url: "/getAccesskey", method: "GET"}).then((res: ResultAccessKey) => {
    accessKey = res.result;
    // console.log(accessKey)
  })

  // 上传文件方法
  // 不分片，直接传的时间是 最终花费时间: 14983ms => 15s
  input.value!.addEventListener("change", async (e) => {
      // console.log(input.value?.files)
      // let file = input.value?.files![0];
      console.log(input.value?.files?.length, "111")
      
      if(input.value?.files?.length) {
        console.log(input.value)
        // 拿到要上传的文件
        let file: File = input.value.files![0];
        console.log(file)

        let fileInfo = {
          name: file.name.match(/^(.+)\.[^\.]+$/)![1],
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          fileSize: file.size,
          progress: fileProgress
        }

        console.log(fileInfo)

        // 文件比较小时，选择直接上传
        if(file.size < partSizeLimit) {
          const formData = new FormData()
          formData.append('key', file.name)
          formData.append('policy', accessKey.policy)
          formData.append('OSSAccessKeyId', accessKey.OSSAccessKeyId)
          formData.append('success_action_status', "200")
          formData.append('signature', accessKey.signature)
          formData.append('file', file)
          let startTime = Date.now();
          await http1.request({ url: accessKey.host, method: "POST", data: formData})
          let endTime = Date.now();
          console.log("最终花费时间:", endTime - startTime)
          time.value = endTime - startTime;
        }else {
          // 通过文件信息创建每个文件唯一 ID
          const saveFileId = `${fileInfo.name}_${fileInfo.size}_${fileInfo.name}_${fileInfo.type}`

          // 文件较大，使用分片上传
          let ossClient = new OSS({
            accessKeyId: "LTAI5tKT5FG1g4KTBMUniEFQ",
            accessKeySecret: "tDUhfxa9xzNbjFWxF8M6CmcDOYGwk7",
            bucket: "upload-test1-oss",
            region: 'oss-cn-beijing'
          })

          console.log(saveFileId)

          let multipartUploadOptions: AMultipartFileOptions = {
            partSize: partSize,
            // 会不断触发这个 progress 方法
            // 参数分别是：分片上传进度(0 - 1)、断点
            progress: (p: number, checkpoint: Checkpoint) => {
              console.log("当前进度:", p)
              fileProgress.value = Math.round(p * 100);

              // 设置进度条
              upload_progress.value!.style.display = "block";
              progress_value.value!.style.width = `${p*100}%`;


              // 保存当前的分片信息，为了断点续传
              savedFileData[saveFileId] = checkpoint;
              savedFileData['lastSaveTime'] = new Date();
              // 可以将已经上传过的存到 lcoalStorage
              localStorage.setItem("oss-upload-file", JSON.stringify(savedFileData));
            },
          }
          let startTime = Date.now()

          resumeUpload(multipartUploadOptions, saveFileId)

          /**
           * 接受三个参数：文件名、要上传的文件、配置的选项
           * 如果配置的选项中包含了 checkpoint 恢复上传的断点文件，那么就会从中断的位置继续上传
           */
          ossClient.multipartUpload(fileInfo.name, file, multipartUploadOptions).then((res) => {
            if(res.res.status == 200) {
              let endTime = Date.now();
              console.log("上传成功，花费时间", endTime - startTime)
              console.log(res)
              time.value = endTime - startTime;

              progress_value.value!.style.width = `${fileProgress.value}%`;
              
              // 上传成功了文件，将对应的这个缓存删掉
              delete savedFileData[saveFileId];
              // 再重新存一下 localStorage
              localStorage.setItem("oss-upload-file", JSON.stringify(savedFileData));
            }
          }).catch((err) => {
            console.log("上传出错啦", err)
          })
        }

      }else {
        console.log(new Error("没有传入文件"))
      }
  })

  /**
   * 断点续传
   * 就是判断当前要上传的文件跟存在内存中的，没上传完的比较
   * 如果一样，就接着从断点文件处开始上传
   * @param options 
   * @param saveFileId 
   */
  function resumeUpload(options: AMultipartFileOptions, saveFileId: string) {
    console.log("resumeUpload")
    if (localStorage.getItem('oss-upload-file')) {
      const obj = JSON.parse(localStorage.getItem('oss-upload-file')!)
      if (Object.keys(obj).includes(saveFileId)) {
        options.checkpoint = obj[saveFileId]
      }
    }
  }
})
</script>

<style lang="less">
  .upload_inp {
      display: none
  }
  .upload_button {
      position: relative;
      box-sizing: border-box;
      margin-right: 10px;
      padding: 0 10px;
      min-width: 80px;
      height: 30px;
      line-height: 30px;
      text-align: center;
      border: none;
      cursor: pointer;
      background-color: #DDD;
      overflow: hidden;
  }
  .upload_button:after {
      position: absolute;
      top: 30px;
      left: 0;
      z-index: 999;
      transition: top .1s;
      box-sizing: border-box;
      padding-left: 25px;
      width: 100%;
      height: 100%;
      content: 'loading...';
      text-align: left;
      //background: url('@/assets/loading.gif') no-repeat 5px center #EEE;
      background-size: 15px 15px;
      color: #999;
  }

  .upload_button.loading {
      cursor: inherit;
  }

  .upload_button.loading:after {
      top: 0;
  }

  .upload_button.select {
      background: #409eff;
      color: #FFF;
  }

  .upload_button.upload {
      background: #67c23a;
      color: #FFF;
  }

  .upload_button.disable {
      background: #EEE;
      color: #999;
      cursor: inherit;
  }

  // 进度条
  .upload_progress {
    position: relative;
    width: 200px;
    height: 5px;
    margin-top: 10px;
    display: none;

    .value {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 999;
      height: 100%;
      width: 0%;
      background: #67c23a;
      transition: width .3s;
    }
  }

</style>