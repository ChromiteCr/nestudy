/**
 * 预留接口：多媒体上传通道。S4 只做本地 OPFS 存储，不联网；
 * 这两个函数只定形状，函数体留空实现，S5/S7 真正需要时再填。
 */

export async function uploadToAiServer(_ref: string): Promise<never> {
  throw new Error('尚未实现：AI 服务器上传通道预留至视觉能力上线后')
}

export async function uploadToOwnServer(_ref: string): Promise<never> {
  throw new Error('尚未实现：自建服务器上传通道预留至 ICP 备案完成后')
}
