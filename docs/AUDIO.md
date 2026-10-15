# 百味饭馆音效与配乐

项目使用本地程序合成原创音频，没有下载第三方录音或模仿现成曲目。`scripts/synthesize-audio.cjs` 使用Node内置功能生成22.05kHz、16bit、单声道PCM WAV。

运行 `npm run audio:build` 即可重建以下14个音频及 `assets/audio/bank.js`。合成结果是确定性的，不使用游戏随机数或网络API。源WAV可以独立试听或替换，浏览器加载内嵌Base64音频库，避免file://环境下的fetch限制。

| 文件 | 用途 | 合成方式 |
| --- | --- | --- |
| click.wav | 普通操作 | 短促柔和拨弦 |
| arrival.wav | 客人到访 | 双音门铃 |
| ready.wav | 菜品完成 | 上行清脆三音提示 |
| serve.wav | 出餐 | 两个轻木质拨音 |
| checkout.wav | 结账 | 高频短金属泛音 |
| warning.wav | 无效操作 | 温和下降双音 |
| growth.wav | 研发或升级 | 五声音阶上行拨弦 |
| wand.wav | 仙女棒 | 高频闪光和扫频 |
| pill.wav | 能量药丸 | 气泡扫频和短上行音 |
| mirror.wav | 魔法镜 | 轻柔闪烁泛音 |
| donut.wav | 甜甜圈 | 温暖上行和弦 |
| bomb.wav | 炸弹拉客 | 温和低鼓和呼应音，非爆炸录音 |
| music.wav | 环境配乐 | 24秒原创D小调五声音阶旋律、低音与拨弦和声 |
| cooking.wav | 后厨氛围 | 4秒低音量、滤波噪声模拟烹饪声 |

配乐在采样数组尾部回绕叠加音符尾音；测试检查首尾相邻采样差，避免循环处突变。输出留有音量余量，测试检测削波、直流偏移和非零信号。音效具有攻击/衰减包络，不以满振幅矩形波发声。

## 播放控制

首次用户点击或键盘操作后创建/恢复AudioContext，解码结果缓存。静音、音量、音乐、音效、动态偏好单独保存于 `baiwei.preferences.v1`，不会混入经营存档。

背景音乐与后厨声每种最多一个循环节点，暂停/查看弹窗/后台时停止，音乐恢复接续原位置。短音效相同类型间隔至少90ms、并发最多8个；高倍速下避免每个客人叠加成巨大音量。总线加入温和动态压缩，控制混音峰值。设置中的显式试听允许在说明弹窗暂停状态下播放一次提示音。

音频只读取经营事件，不能推进Tick、修改客人或资源。Web Audio不可用或解码失败时平稳降级，页面仍能运行。音效控制测试使用模拟AudioContext验证生命周期；浏览器实测解码与试听按钮。自动测试不代表对每一台设备实际扬声器音质的验证。

实现参考：[AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume) 和 [AudioBufferSourceNode.loop](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop)。
