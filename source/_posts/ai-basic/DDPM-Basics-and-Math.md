---
title: DDPM 模型基础与数学推导
date: 2026-08-30 10:00:00
katex: true
column: diffusion
tags:
  - DDPM
  - Diffusion
  - Generative AI
  - Math
---

# DDPM 模型基础与数学推导

> Denoising Diffusion Probabilistic Models（DDPM）由 Ho 等人在 2020 年提出，是扩散生成模型的开山之作，也是 score-based model、Latent Diffusion（Stable Diffusion）、flow matching 等一系列后续工作的基础。这篇文章从思想出发，把前向加噪过程和训练 Loss 的数学推导完整走一遍。

---

## 1. 核心思想

DDPM 把「生成一张图片」建模成 **逐步去噪** 的过程，由两个相反的过程组成：

- **前向过程（扩散 / 加噪）**：对真实数据 $x_0$ 逐步叠加高斯噪声，经过 $T$ 步后变成几乎纯噪声 $x_T$。这个过程是**简单且封闭可解**的——任意时刻的 $x_t$ 可以直接由 $x_0$ 一个公式算出，不需要逐步模拟。
- **逆向过程（去噪 / 生成）**：训练一个神经网络 $p_\theta$，学习把噪声逐步还原成数据。生成样本时，从纯噪声 $x_T \sim \mathcal{N}(0, I)$ 出发，迭代去噪 $T$ 步得到 $x_0$。

三个关键洞见支撑了这套设计：

1. **加噪容易，去噪难但可学习**：给数据加噪声只需要一个线性变换；而「给定带噪图片，猜它上一步长什么样」是一个神经网络擅长拟合的回归任务。
2. **闭式可解性**：前向过程任意时刻的边缘分布是高斯分布，且可以用重参数化技巧直接采样，这让训练变得极其高效。
3. **训练即去噪**：最终训练目标退化成一个简洁的「噪声预测」回归，稳定、好实现。

---

## 2. 前向加噪过程

### 2.1 单步加噪

设噪声表 $\beta_1, \beta_2, \dots, \beta_T$ 是预定义的（通常从 $0.0001$ 线性增大到 $0.02$ ）。前向过程每一步定义为：

$$
q(x_t \mid x_{t-1}) = \mathcal{N}\left(x_t; \sqrt{1-\beta_t}\, x_{t-1},\ \beta_t I\right)
$$

即每一步都从 $x_{t-1}$ 出发，保留一部分信息，叠加一点高斯噪声。利用**重参数化技巧**，采样 $x_t$ 等价于：

$$
x_t = \sqrt{1-\beta_t}\, x_{t-1} + \sqrt{\beta_t}\, \varepsilon, \qquad \varepsilon \sim \mathcal{N}(0, I)
$$

为了记号简洁，记：

$$
\alpha_t = 1 - \beta_t, \qquad \bar{\alpha}_t = \prod_{s=1}^{t} \alpha_s
$$

### 2.2 任意时刻的边缘分布（关键推导）

我们要推导：$x_t$ 可以直接写成 $x_0$ 加一个整体噪声的形式。从 $x_t$ 的表达式开始，把 $x_{t-1}$ 再展开一步：

$$
\begin{aligned}
x_t &= \sqrt{\alpha_t}\, x_{t-1} + \sqrt{1-\alpha_t}\, \varepsilon_{t-1} \\
    &= \sqrt{\alpha_t}\left(\sqrt{\alpha_{t-1}}\, x_{t-2} + \sqrt{1-\alpha_{t-1}}\, \varepsilon_{t-2}\right) + \sqrt{1-\alpha_t}\, \varepsilon_{t-1} \\
    &= \sqrt{\alpha_t \alpha_{t-1}}\, x_{t-2} + \underbrace{\sqrt{\alpha_t(1-\alpha_{t-1})}\, \varepsilon_{t-2} + \sqrt{1-\alpha_t}\, \varepsilon_{t-1}}_{\text{两个独立标准高斯的加权和}}
\end{aligned}
$$

这里用到一个基本性质：**两个独立的 $\mathcal{N}(0, I)$ 的线性组合仍是高斯**，且方差相加。上面括号里的两项合并后的方差为：

$$
\alpha_t(1-\alpha_{t-1}) + (1-\alpha_t) = 1 - \alpha_t \alpha_{t-1}
$$

因此存在一个新的标准高斯噪声 $\varepsilon' \sim \mathcal{N}(0, I)$，使得：

$$
x_t = \sqrt{\alpha_t \alpha_{t-1}}\, x_{t-2} + \sqrt{1 - \alpha_t \alpha_{t-1}}\, \varepsilon'
$$

不断递归（数学归纳法），最后得到**闭式边缘分布**：

$$
\boxed{\,x_t = \sqrt{\bar{\alpha}_t}\, x_0 + \sqrt{1-\bar{\alpha}_t}\, \varepsilon, \qquad \varepsilon \sim \mathcal{N}(0, I)\,}
$$

也就是：

$$
q(x_t \mid x_0) = \mathcal{N}\left(x_t; \sqrt{\bar{\alpha}_t}\, x_0,\ (1-\bar{\alpha}_t) I\right)
$$

当 $t \to T$ 时 $\bar{\alpha}_t \to 0$，$x_T$ 收敛到标准高斯 $\mathcal{N}(0, I)$，这正是「扩散到最后变成纯噪声」的数学表达。

这个式子的价值在于：**训练时不需要逐 $t$ 模拟加噪**，任意采样一个 $t$ 和一个噪声 $\varepsilon$，就能一步得到对应的 $x_t$。

---

## 3. 逆向去噪过程

逆向过程用一个参数为 $\theta$ 的神经网络建模：

$$
p_\theta(x_{t-1} \mid x_t) = \mathcal{N}\left(x_{t-1}; \mu_\theta(x_t, t),\ \Sigma_\theta(x_t, t)\right)
$$

实践中通常把方差 $\Sigma_\theta$ 固定（令其为后面推导出的后验方差 $\tilde\beta_t I$ ），核心只学均值 $\mu_\theta$ 。生成时从 $x_T \sim \mathcal{N}(0, I)$ 出发，按 $t = T, T-1, \dots, 1$ 迭代采样 $p_\theta(x_{t-1}\mid x_t)$，最终得到 $x_0$。

---

## 4. 训练目标：Loss 的构建（关键推导）

### 4.1 从变分下界出发

目标是最大化数据对数似然 $\log p_\theta(x_0)$，但它是难解（intractable）的。仿照 VAE，利用**变分下界（ELBO）**：

$$
\log p_\theta(x_0) \ge \mathbb{E}_{q(x_{1:T}\mid x_0)}\left[\log \frac{p_\theta(x_{0:T})}{q(x_{1:T}\mid x_0)}\right]
$$

将联合分布拆开并把期望内的对数展开，可以整理成三项之和（这里略去中间的代数，只写结论）：

$$
L = \underbrace{-\mathbb{E}_q\left[\log p_\theta(x_0\mid x_1)\right]}_{\text{(1) 重建项}}
+ \underbrace{\sum_{t=2}^{T} \mathbb{E}_q\left[D_{\mathrm{KL}}\left(q(x_{t-1}\mid x_t, x_0) \;\|\; p_\theta(x_{t-1}\mid x_t)\right)\right]}_{\text{(2) 逐步去噪匹配项}}
+ \underbrace{D_{\mathrm{KL}}\left(q(x_T\mid x_0) \;\|\; p(x_T)\right)}_{\text{(3) 先验项}}
$$

- **(1) 重建项**：从 $x_1$ 还原 $x_0$，类似自编码器的重建误差。
- **(2) 去噪匹配项**：让学到的去噪分布 $p_\theta(x_{t-1}\mid x_t)$ 逼近「给定 $x_0$ 时的真实后验」$q(x_{t-1}\mid x_t, x_0)$ 。
- **(3) 先验项**：衡量 $x_T$ 是否接近标准高斯先验，由于加噪收敛，该项通常趋于 0，可以忽略。

核心难点在第 ② 项，但它恰好是**可解的**：真实后验 $q(x_{t-1}\mid x_t, x_0)$ 是高斯分布。

### 4.2 真实后验 $q(x_{t-1}\mid x_t, x_0)$ 的推导

由贝叶斯公式：

$$
q(x_{t-1}\mid x_t, x_0) \propto q(x_t \mid x_{t-1})\, q(x_{t-1}\mid x_0)
$$

两边都是高斯（一个来自单步加噪定义，一个来自 2.2 节的边缘分布），高斯的乘积仍是高斯。配合重参数化整理，可得真实后验的均值与方差：

$$
q(x_{t-1}\mid x_t, x_0) = \mathcal{N}\left(x_{t-1};\, \tilde\mu_t(x_t, x_0),\ \tilde\beta_t I\right)
$$

其中：

$$
\tilde\mu_t(x_t, x_0) = \frac{\sqrt{\bar\alpha_{t-1}}\,\beta_t}{1-\bar\alpha_t}\, x_0
+ \frac{\sqrt{\alpha_t}\,(1-\bar\alpha_{t-1})}{1-\bar\alpha_t}\, x_t
$$

$$
\tilde\beta_t = \frac{1-\bar\alpha_{t-1}}{1-\bar\alpha_t}\, \beta_t
$$

现在把 $x_0$ 用 2.2 节的闭式解反解出来：$x_0 = \dfrac{x_t - \sqrt{1-\bar\alpha_t}\,\varepsilon}{\sqrt{\bar\alpha_t}}$ ，代入 $\tilde\mu_t$ 并化简，可以得到一个**只依赖于 $x_t$ 和注入噪声 $\varepsilon$ 的漂亮形式**：

$$
\boxed{\;\tilde\mu_t(x_t, x_0) = \frac{1}{\sqrt{\alpha_t}}\left(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\, \varepsilon\right)\;}
$$

这个形式说明：真实后验的均值，本质上就是「从 $x_t$ 中把预测的噪声去掉一步」。

### 4.3 KL 项化简：预测噪声

当 $p_\theta$ 的方差固定为 $\tilde\beta_t I$ 时，两个高斯之间的 KL 散度有闭式解：

$$
D_{\mathrm{KL}}\left(\mathcal{N}(\tilde\mu, \sigma^2 I) \;\|\; \mathcal{N}(\mu_\theta, \sigma^2 I)\right)
= \frac{1}{2\sigma^2}\, \left\|\tilde\mu - \mu_\theta\right\|^2
$$

于是第 ② 项的每一项正比于：

$$
\left\|\tilde\mu_t(x_t, x_0) - \mu_\theta(x_t, t)\right\|^2
$$

如果我们也把网络均值 $\mu_\theta$ 参数化成「预测噪声」的形式，即：

$$
\mu_\theta(x_t, t) = \frac{1}{\sqrt{\alpha_t}}\left(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\, \varepsilon_\theta(x_t, t)\right)
$$

代入后 $x_t$ 与 $\frac{1}{\sqrt{\alpha_t}}$ 部分相消，Loss 就只剩下噪声之间的差：

$$
L_t = \mathbb{E}_{x_0, t, \varepsilon}\left[\, \left\| \varepsilon - \varepsilon_\theta\!\left(\sqrt{\bar\alpha_t}\, x_0 + \sqrt{1-\bar\alpha_t}\, \varepsilon,\ t\right)\right\|^2 \,\right]
$$

这就是 DDPM 论文采用的**简化训练目标**：网络输入「加噪到 $t$ 步的样本 $x_t$ 」和时间步 $t$，输出预测的噪声 $\varepsilon$。Ho 等人发现，去掉完整 ELBO 里各项权重后的这个简化版本，训练更稳定、效果反而更好。

---

## 5. 训练与采样算法

**训练**（每次迭代）：
1. 采样真实样本 $x_0 \sim q(x_0)$，时间步 $t \sim \mathrm{Uniform}\{1,\dots,T\}$，噪声 $\varepsilon \sim \mathcal{N}(0, I)$；
2. 计算 $x_t = \sqrt{\bar\alpha_t}\, x_0 + \sqrt{1-\bar\alpha_t}\, \varepsilon$；
3. 对 $\left\|\varepsilon - \varepsilon_\theta(x_t, t)\right\|^2$ 做一步梯度下降。

**采样**（生成）：
1. 从纯噪声出发 $x_T \sim \mathcal{N}(0, I)$；
2. 对 $t = T, T-1, \dots, 1$：
   $$x_{t-1} = \frac{1}{\sqrt{\alpha_t}}\left(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\, \varepsilon_\theta(x_t, t)\right) + \sqrt{\tilde\beta_t}\, z, \qquad z \sim \mathcal{N}(0, I)\ (\text{仅 } t>1)$$
3. 返回 $x_0$。

---

## 6. 总结

- DDPM 把生成问题转化为**迭代去噪**，训练目标最终退化为简洁的「噪声预测」回归，稳定且易于实现。
- 数学上优雅之处在于：**前向边缘分布闭式可解**（重参数化 + 高斯线性组合），**真实后验闭式可解**（贝叶斯 + 高斯乘积），使得训练和推导都有明确解析形式。
- 后续的 DDIM（加速采样）、Latent Diffusion / Stable Diffusion（在潜空间扩散）、score-based models 与 flow matching 都是在这套框架上的改进与推广。

---

## 参考

- Ho, J., Jain, A., Abbeel, P. *Denoising Diffusion Probabilistic Models*. NeurIPS 2020.
- Luo, C. *Understanding Diffusion Models: A Unified Perspective*. arXiv:2208.11970, 2022.
